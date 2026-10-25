"""
Tests for Section A: Anonymous Persona Seeding Security Hotfix & Abuse Protections.

Covers:
1. Anonymous request -> 401 {code: 'auth_required'} and ZERO rows created.
2. Valid guest -> 200, second call updates dates, not duplicates (idempotent).
3. Caps:
   - Per-identity: 1 seed / 60 s -> 429 {code: 'seeding_rate_limited'} + Retry-After.
   - Per-identity: 10 seeds / day -> 429 {code: 'seeding_rate_limited'} + Retry-After.
   - Per-IP: 10 seeds / hour counting DISTINCT identities -> 429 {code: 'seeding_rate_limited'} + Retry-After.
   - Global daily cap on persona-seeded identities (default 300) -> 429 {code: 'seeding_rate_limited'} + Retry-After.
4. DB failure in seed endpoint -> 503 db_unavailable + Retry-After, and NO mint.
5. Rate limiter failure in production and unset ENVIRONMENT -> 503 rate_limiter_unavailable (fail-closed).
6. Request with forged raw x-guest-id -> 403 / 401 rejected.
"""

import time
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from httpx import AsyncClient
from backend.config import get_settings
from backend.dependencies import generate_guest_token
from backend.memory.db import get_pool


@pytest.mark.asyncio
async def test_anonymous_request_returns_401_and_zero_rows(client: AsyncClient, monkeypatch):
    """Anonymous request without session or token is rejected with 401 auth_required and creates 0 rows."""
    settings = get_settings()
    monkeypatch.setattr(settings, "ENABLE_DEMO_SEEDING", True)

    resp = await client.post("/api/demo/seed-persona", json={"tz": "UTC"})
    assert resp.status_code == 401
    data = resp.json()
    assert data["code"] == "auth_required"
    assert "authentication required" in data["detail"].lower()
    assert "guest_token" not in data

    # Verify zero demo tasks exist for any anonymous user
    pool = await get_pool()
    if pool:
        async with pool.acquire() as conn:
            cnt = await conn.fetchval(
                "SELECT COUNT(*) FROM tasks WHERE trusted_event_url LIKE 'compass://demo-persona/%' AND user_id IS NULL"
            ) or 0
            assert cnt == 0


@pytest.mark.asyncio
async def test_valid_guest_seeds_and_second_call_updates_without_duplicates(client: AsyncClient, monkeypatch):
    """Valid guest gets 200, exactly 21 tasks; second call updates dates without duplicating rows."""
    settings = get_settings()
    monkeypatch.setattr(settings, "ENABLE_DEMO_SEEDING", True)
    monkeypatch.setattr(settings, "ENVIRONMENT", "test")

    guest_id, guest_token = generate_guest_token()
    headers = {"x-guest-token": guest_token}

    resp1 = await client.post("/api/demo/seed-persona", headers=headers, json={"tz": "UTC"})
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["status"] == "ok"
    assert data1["tasks_seeded"] == 21
    assert data1["user_id"] == guest_id

    pool = await get_pool()
    if pool:
        async with pool.acquire() as conn:
            cnt1 = await conn.fetchval(
                "SELECT COUNT(*) FROM tasks WHERE user_id = $1 AND trusted_event_url LIKE 'compass://demo-persona/%'",
                guest_id,
            )
            assert cnt1 == 21

            # Bypass the 60s per-identity rate limit for testing idempotency
            await conn.execute("DELETE FROM rate_limit_buckets WHERE key LIKE 'seed:ident:min:%'")

        # Second call with another reference date
        resp2 = await client.post(
            "/api/demo/seed-persona",
            headers=headers,
            json={"tz": "UTC", "reference_date": "2026-11-01"},
        )
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2["tasks_seeded"] == 21

        async with pool.acquire() as conn:
            cnt2 = await conn.fetchval(
                "SELECT COUNT(*) FROM tasks WHERE user_id = $1 AND trusted_event_url LIKE 'compass://demo-persona/%'",
                guest_id,
            )
            # Must remain exactly 21, not 42!
            assert cnt2 == 21


@pytest.mark.asyncio
async def test_per_identity_60s_rate_limit(client: AsyncClient, monkeypatch):
    """Second seed request within 60 seconds from same identity returns 429 seeding_rate_limited + Retry-After."""
    settings = get_settings()
    monkeypatch.setattr(settings, "ENABLE_DEMO_SEEDING", True)
    monkeypatch.setattr(settings, "ENVIRONMENT", "test")

    guest_id, guest_token = generate_guest_token()
    headers = {"x-guest-token": guest_token}

    resp1 = await client.post("/api/demo/seed-persona", headers=headers, json={"tz": "UTC"})
    assert resp1.status_code == 200

    resp2 = await client.post("/api/demo/seed-persona", headers=headers, json={"tz": "UTC"})
    assert resp2.status_code == 429
    assert "retry-after" in resp2.headers
    data2 = resp2.json()
    assert data2["code"] == "seeding_rate_limited"
    assert "60 seconds" in data2["detail"]


@pytest.mark.asyncio
async def test_per_identity_daily_rate_limit(client: AsyncClient, monkeypatch):
    """Exceeding 10 seeds in a day for same identity returns 429 seeding_rate_limited + Retry-After."""
    settings = get_settings()
    monkeypatch.setattr(settings, "ENABLE_DEMO_SEEDING", True)
    monkeypatch.setattr(settings, "ENVIRONMENT", "test")

    guest_id, guest_token = generate_guest_token()
    headers = {"x-guest-token": guest_token}

    pool = await get_pool()
    if pool:
        async with pool.acquire() as conn:
            # Pre-set the daily token bucket to 0 tokens
            await conn.execute(
                """
                INSERT INTO rate_limit_buckets (key, tokens, last_updated)
                VALUES ($1, 0.0, now())
                ON CONFLICT (key) DO UPDATE SET tokens = 0.0, last_updated = now()
                """,
                f"seed:ident:day:{guest_id}",
            )

        resp = await client.post("/api/demo/seed-persona", headers=headers, json={"tz": "UTC"})
        assert resp.status_code == 429
        assert "retry-after" in resp.headers
        data = resp.json()
        assert data["code"] == "seeding_rate_limited"
        assert "maximum 10 seeds per day" in data["detail"]


@pytest.mark.asyncio
async def test_per_ip_hourly_limit_counting_distinct_identities(client: AsyncClient, monkeypatch):
    """Exceeding 10 distinct identities per hour from same IP returns 429 seeding_rate_limited + Retry-After."""
    settings = get_settings()
    monkeypatch.setattr(settings, "ENABLE_DEMO_SEEDING", True)
    monkeypatch.setattr(settings, "ENVIRONMENT", "test")

    test_ip = "198.51.100.42"
    headers_base = {"x-forwarded-for": test_ip}

    pool = await get_pool()
    if pool:
        async with pool.acquire() as conn:
            # Set the hourly IP bucket to 0 tokens
            await conn.execute(
                """
                INSERT INTO rate_limit_buckets (key, tokens, last_updated)
                VALUES ($1, 0.0, now())
                ON CONFLICT (key) DO UPDATE SET tokens = 0.0, last_updated = now()
                """,
                f"seed:ip:hour:{test_ip}",
            )

        # Fresh guest from same IP attempting to seed
        _, fresh_token = generate_guest_token()
        headers = {**headers_base, "x-guest-token": fresh_token}

        resp = await client.post("/api/demo/seed-persona", headers=headers, json={"tz": "UTC"})
        assert resp.status_code == 429
        assert "retry-after" in resp.headers
        data = resp.json()
        assert data["code"] == "seeding_rate_limited"
        assert "maximum 10 distinct identities per hour" in data["detail"]


@pytest.mark.asyncio
async def test_global_daily_cap_on_persona_seeded_identities(client: AsyncClient, monkeypatch):
    """Exceeding global daily demo seed cap returns 429 seeding_rate_limited + Retry-After."""
    from datetime import date
    settings = get_settings()
    monkeypatch.setattr(settings, "ENABLE_DEMO_SEEDING", True)
    monkeypatch.setattr(settings, "ENVIRONMENT", "test")
    monkeypatch.setattr(settings, "GLOBAL_DAILY_DEMO_SEED_CAP", 5)

    today_str = date.today().isoformat()
    pool = await get_pool()
    if pool:
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO rate_limit_buckets (key, tokens, last_updated)
                VALUES ($1, 0.0, now())
                ON CONFLICT (key) DO UPDATE SET tokens = 0.0, last_updated = now()
                """,
                f"seed:global:day:{today_str}",
            )

        _, guest_token = generate_guest_token()
        headers = {"x-guest-token": guest_token}

        resp = await client.post("/api/demo/seed-persona", headers=headers, json={"tz": "UTC"})
        assert resp.status_code == 429
        assert "retry-after" in resp.headers
        data = resp.json()
        assert data["code"] == "seeding_rate_limited"
        assert "Global daily demo seeding limit" in data["detail"]


@pytest.mark.asyncio
async def test_db_failure_returns_503_and_no_mint(client: AsyncClient, monkeypatch):
    """When DB pool fails on seed route, returns 503 db_unavailable and does not mint token."""
    settings = get_settings()
    monkeypatch.setattr(settings, "ENABLE_DEMO_SEEDING", True)

    _, guest_token = generate_guest_token()
    headers = {"x-guest-token": guest_token}

    with patch("backend.routers.tasks_verification.get_pool", return_value=None):
        resp = await client.post("/api/demo/seed-persona", headers=headers, json={"tz": "UTC"})
        assert resp.status_code == 503
        assert resp.headers.get("retry-after") == "5"
        data = resp.json()
        assert data["code"] == "db_unavailable"
        assert "guest_token" not in data


@pytest.mark.asyncio
async def test_production_and_unset_environment_rate_limiter_fail_closed(client: AsyncClient, monkeypatch):
    """In production and unset ENVIRONMENT, DB rate limiter errors fail closed with 503."""
    settings = get_settings()
    monkeypatch.setattr(settings, "ENABLE_DEMO_SEEDING", True)

    _, guest_token = generate_guest_token()
    headers = {"x-guest-token": guest_token}

    # 1. ENVIRONMENT="production"
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    with patch("backend.services.rate_limiter.get_pool", side_effect=Exception("Neon DB outage")):
        resp_prod = await client.post("/api/demo/seed-persona", headers=headers, json={"tz": "UTC"})
        assert resp_prod.status_code == 503
        assert resp_prod.json()["code"] == "rate_limiter_unavailable"

    # 2. ENVIRONMENT="" (unset)
    monkeypatch.setattr(settings, "ENVIRONMENT", "")
    with patch("backend.services.rate_limiter.get_pool", side_effect=Exception("Neon DB outage")):
        resp_unset = await client.post("/api/demo/seed-persona", headers=headers, json={"tz": "UTC"})
        assert resp_unset.status_code == 503
        assert resp_unset.json()["code"] == "rate_limiter_unavailable"


@pytest.mark.asyncio
async def test_forged_raw_x_guest_id_rejected_in_production(client: AsyncClient, monkeypatch):
    """Raw forged x-guest-id header without signed x-guest-token is strictly rejected in production."""
    settings = get_settings()
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "ENABLE_DEMO_SEEDING", True)

    forged_headers = {"x-guest-id": "00000000-0000-4000-8000-000000000001"}
    resp = await client.post("/api/demo/seed-persona", headers=forged_headers, json={"tz": "UTC"})
    # 403 or 401 rejected, never mints or seeds
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_client_ip_two_different_xff_clients_get_separate_buckets(client: AsyncClient, monkeypatch):
    """Two different client IPs in X-Forwarded-For get separate rate-limit buckets."""
    settings = get_settings()
    monkeypatch.setattr(settings, "ENABLE_DEMO_SEEDING", True)
    monkeypatch.setattr(settings, "ENVIRONMENT", "test")

    ip_a = "203.0.113.10"
    ip_b = "203.0.113.20"

    pool = await get_pool()
    if pool:
        async with pool.acquire() as conn:
            # Exhaust IP A's hourly bucket
            await conn.execute(
                """
                INSERT INTO rate_limit_buckets (key, tokens, last_updated)
                VALUES ($1, 0.0, now())
                ON CONFLICT (key) DO UPDATE SET tokens = 0.0, last_updated = now()
                """,
                f"seed:ip:hour:{ip_a}",
            )

        # Fresh guest from IP A -> 429
        _, token_a = generate_guest_token()
        resp_a = await client.post(
            "/api/demo/seed-persona",
            headers={"x-guest-token": token_a, "x-forwarded-for": ip_a},
            json={"tz": "UTC"},
        )
        assert resp_a.status_code == 429
        assert resp_a.json()["code"] == "seeding_rate_limited"

        # Fresh guest from IP B -> 200 (separate bucket is full)
        _, token_b = generate_guest_token()
        resp_b = await client.post(
            "/api/demo/seed-persona",
            headers={"x-guest-token": token_b, "x-forwarded-for": ip_b},
            json={"tz": "UTC"},
        )
        assert resp_b.status_code == 200
        assert resp_b.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_client_ip_spoofed_header_cannot_bypass_cap(client: AsyncClient, monkeypatch):
    """Prepending a spoofed IP to X-Forwarded-For does not bypass the rate limit on the real client IP."""
    settings = get_settings()
    monkeypatch.setattr(settings, "ENABLE_DEMO_SEEDING", True)
    monkeypatch.setattr(settings, "ENVIRONMENT", "test")
    monkeypatch.setattr(settings, "TRUSTED_PROXY_HOPS", 1)

    real_ip = "198.51.100.99"

    pool = await get_pool()
    if pool:
        async with pool.acquire() as conn:
            # Exhaust the real IP's bucket
            await conn.execute(
                """
                INSERT INTO rate_limit_buckets (key, tokens, last_updated)
                VALUES ($1, 0.0, now())
                ON CONFLICT (key) DO UPDATE SET tokens = 0.0, last_updated = now()
                """,
                f"seed:ip:hour:{real_ip}",
            )

        # Attacker tries prepending a spoofed IP: "1.2.3.4, 198.51.100.99"
        _, token = generate_guest_token()
        spoofed_xff = f"1.2.3.4, {real_ip}"
        resp = await client.post(
            "/api/demo/seed-persona",
            headers={"x-guest-token": token, "x-forwarded-for": spoofed_xff},
            json={"tz": "UTC"},
        )
        # Cap is strictly enforced against the trusted rightmost hop (real_ip), not bypassed by 1.2.3.4
        assert resp.status_code == 429
        assert resp.json()["code"] == "seeding_rate_limited"


@pytest.mark.asyncio
async def test_seeding_disabled_returns_403_and_inline_notice(client: AsyncClient, monkeypatch):
    """When ENABLE_DEMO_SEEDING=False, seeding returns 403 seeding_disabled and maps to disabled notice."""
    settings = get_settings()
    monkeypatch.setattr(settings, "ENABLE_DEMO_SEEDING", False)

    _, guest_token = generate_guest_token()
    headers = {"x-guest-token": guest_token}

    resp = await client.post("/api/demo/seed-persona", headers=headers, json={"tz": "UTC"})
    assert resp.status_code == 403
    data = resp.json()
    assert data["code"] == "seeding_disabled"
    assert "disabled on this server" in data["detail"].lower()

