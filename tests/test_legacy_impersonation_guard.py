"""
Compass — Legacy Impersonation Guard & Stale Cookie Mitigation Test Suite.

Proves:
1. Production/unset env + x-user-id header -> 403.
2. Production + stale compass_user_id cookie -> ignored/cleared, request authenticated via signed guest token, not 403.
3. Production + stale compass_user_id cookie without guest/session token -> ignored (returns None identity, no 403 lock-out).
4. Development/test env + legacy header -> allowed where previously allowed.
"""

import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch

from backend.main import app
from backend.config import get_settings
from fastapi import HTTPException
from starlette.requests import Request
from backend.dependencies import generate_guest_token, _get_current_identity


@pytest.mark.asyncio
async def test_production_rejects_x_user_id_header():
    """Production or unset environment unconditionally rejects x-user-id header with 403."""
    transport = ASGITransport(app=app)
    settings = get_settings()

    with patch.object(settings, "ENVIRONMENT", "production"):
        async with AsyncClient(transport=transport, base_url="https://compass.test") as client:
            resp = await client.get("/api/auth/me", headers={"x-user-id": "attacker@evil.com"})
            assert resp.status_code == 403
            detail = resp.json()["detail"]
            assert "impersonation is strictly forbidden" in detail
            assert "Set ENVIRONMENT=development" in detail


@pytest.mark.asyncio
async def test_production_stale_compass_user_id_cookie_ignored_with_signed_guest_token():
    """Production environment ignores stale compass_user_id cookie when valid signed guest token is present.
    Authenticates cleanly as guest with 200, does not 403, and clears the stale cookie.
    """
    transport = ASGITransport(app=app)
    settings = get_settings()

    with patch.object(settings, "ENVIRONMENT", "production"), \
         patch.object(settings, "GUEST_SIGNING_SECRET", "super-secret-production-signing-key-32b"):
        gid, token = generate_guest_token()
        async with AsyncClient(
            transport=transport,
            base_url="https://compass.test",
            cookies={"compass_user_id": "stale_victim@vit.ac.in"},
            headers={"x-guest-token": token},
        ) as client:
            resp = await client.get("/api/auth/me")
            assert resp.status_code == 200
            data = resp.json()
            assert data["authenticated"] is False
            assert data["name"] == "Guest"
            # Response must instruct the browser to delete/expire compass_user_id
            set_cookie_headers = resp.headers.get_list("set-cookie") if hasattr(resp.headers, "get_list") else [resp.headers.get("set-cookie", "")]
            assert any("compass_user_id=" in h for h in set_cookie_headers)


@pytest.mark.asyncio
async def test_production_rejects_unverified_compass_user_id_cookie_without_credentials():
    """In production, an unverified compass_user_id cookie without valid guest or session credentials
    returns HTTP 401 with Set-Cookie clearing the cookie (not a lockout 403).
    """
    settings = get_settings()

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/test",
        "headers": [(b"cookie", b"compass_user_id=stale_victim@vit.ac.in")],
        "query_string": b"",
    }
    req = Request(scope)

    with patch.object(settings, "ENVIRONMENT", "production"):
        with pytest.raises(HTTPException) as exc:
            _get_current_identity(req)
        assert exc.value.status_code == 401
        assert "Stale user cookie" in exc.value.detail
        assert exc.value.headers is not None
        assert "Set-Cookie" in exc.value.headers
        assert "compass_user_id=" in exc.value.headers["Set-Cookie"]


@pytest.mark.asyncio
async def test_development_env_allows_legacy_dev_header():
    """Development environment permits x-user-id header for local developer testing."""
    transport = ASGITransport(app=app)
    settings = get_settings()

    with patch.object(settings, "ENVIRONMENT", "development"):
        async with AsyncClient(transport=transport, base_url="http://localhost:5173") as client:
            resp = await client.get("/api/auth/me", headers={"x-user-id": "dev_engineer@vit.ac.in"})
            assert resp.status_code == 200
            assert resp.json()["user_id"] == "dev_engineer@vit.ac.in"


@pytest.mark.asyncio
async def test_test_env_allows_legacy_test_header():
    """Test environment permits x-user-id header for automated tests."""
    transport = ASGITransport(app=app)
    settings = get_settings()

    with patch.object(settings, "ENVIRONMENT", "test"):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/auth/me", headers={"x-user-id": "ci_runner@vit.ac.in"})
            assert resp.status_code == 200
            assert resp.json()["user_id"] == "ci_runner@vit.ac.in"


@pytest.mark.asyncio
async def test_production_rejects_raw_x_guest_id_header():
    """Production unconditionally rejects raw x-guest-id impersonation header with 403."""
    transport = ASGITransport(app=app)
    settings = get_settings()

    with patch.object(settings, "ENVIRONMENT", "production"):
        async with AsyncClient(transport=transport, base_url="https://compass.test") as client:
            resp = await client.get("/api/auth/me", headers={"x-guest-id": "attacker_guest_uuid"})
            assert resp.status_code == 403
            detail = resp.json()["detail"]
            assert "Raw x-guest-id impersonation is strictly forbidden" in detail
            assert "x-guest-token" in detail


@pytest.mark.asyncio
async def test_production_allows_signed_guest_token():
    """Production accepts valid cryptographically signed x-guest-token header."""
    transport = ASGITransport(app=app)
    settings = get_settings()

    with patch.object(settings, "ENVIRONMENT", "production"), \
         patch.object(settings, "GUEST_SIGNING_SECRET", "super-secret-production-signing-key-32b"):
        gid, token = generate_guest_token()
        async with AsyncClient(transport=transport, base_url="https://compass.test") as client:
            resp = await client.get("/api/auth/me", headers={"x-guest-token": token})
            assert resp.status_code == 200
            data = resp.json()
            assert data["authenticated"] is False
            assert data["name"] == "Guest"

        scope = {
            "type": "http",
            "method": "GET",
            "path": "/api/test",
            "headers": [(b"x-guest-token", token.encode("utf-8"))],
            "query_string": b"",
        }
        ident = _get_current_identity(Request(scope))
        assert ident is not None
        assert ident.is_guest is True
        assert ident.id == gid
        assert ident.guest_id == gid


@pytest.mark.asyncio
async def test_development_env_allows_x_guest_id_header():
    """Development environment permits raw x-guest-id header for local guest testing."""
    transport = ASGITransport(app=app)
    settings = get_settings()

    with patch.object(settings, "ENVIRONMENT", "development"):
        async with AsyncClient(transport=transport, base_url="http://localhost:5173") as client:
            resp = await client.get("/api/auth/me", headers={"x-guest-id": "local_dev_guest_123"})
            assert resp.status_code == 200
            assert resp.json()["authenticated"] is False

        scope = {
            "type": "http",
            "method": "GET",
            "path": "/api/test",
            "headers": [(b"x-guest-id", b"local_dev_guest_123")],
            "query_string": b"",
        }
        ident = _get_current_identity(Request(scope))
        assert ident is not None
        assert ident.is_guest is True
        assert ident.id == "local_dev_guest_123"


