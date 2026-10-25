"""
Tests for demo persona seed diagnostics, fail-closed rate limiting, honest health status, and failure handling.
Covers:
1. DB pool unavailable -> seed returns 503 with code db_unavailable and Retry-After header.
2. Rate limiter backend error in production mode -> 503 rate_limiter_unavailable (fail-closed) with Retry-After header.
3. ENVIRONMENT unset behaves as production (fail-closed for rate limiter).
4. ENABLE_DEMO_SEEDING=false -> 403 seeding_disabled.
5. /health with a failing DB ping -> status='degraded', db_connected=false, no leaked host/credentials.
"""

from unittest.mock import MagicMock, patch
import pytest
from httpx import AsyncClient
from backend.config import get_settings


@pytest.mark.asyncio
async def test_seed_persona_disabled_returns_403(client: AsyncClient, auth_headers: dict, monkeypatch):
    """When ENABLE_DEMO_SEEDING is False, seed returns 403 seeding_disabled, never 503."""
    settings = get_settings()
    monkeypatch.setattr(settings, "ENABLE_DEMO_SEEDING", False)

    resp = await client.post("/api/demo/seed-persona", headers=auth_headers, json={"tz": "UTC"})
    assert resp.status_code == 403
    data = resp.json()
    assert data["code"] == "seeding_disabled"
    assert "disabled" in data["detail"].lower()


@pytest.mark.asyncio
async def test_seed_persona_db_pool_unavailable_returns_503(client: AsyncClient, auth_headers: dict, monkeypatch):
    """When DB pool is unavailable (get_pool returns None or fails), seed returns 503 db_unavailable with Retry-After."""
    settings = get_settings()
    monkeypatch.setattr(settings, "ENABLE_DEMO_SEEDING", True)

    with patch("backend.routers.tasks_verification.get_pool", return_value=None):
        resp = await client.post("/api/demo/seed-persona", headers=auth_headers, json={"tz": "UTC"})
        assert resp.status_code == 503
        assert resp.headers.get("retry-after") == "5"
        data = resp.json()
        assert data["code"] == "db_unavailable"
        assert "temporarily unavailable" in data["detail"].lower()


@pytest.mark.asyncio
async def test_rate_limiter_error_in_production_returns_503(client: AsyncClient, auth_headers: dict, monkeypatch):
    """When rate limiter DB connection fails in production mode, rate limiter fails closed with 503 rate_limiter_unavailable."""
    settings = get_settings()
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "ENABLE_DEMO_SEEDING", True)

    with patch("backend.services.rate_limiter.get_pool", side_effect=Exception("DB pool connection timeout")):
        resp = await client.post("/api/demo/seed-persona", headers=auth_headers, json={"tz": "UTC"})
        assert resp.status_code == 503
        assert resp.headers.get("retry-after") == "5"
        data = resp.json()
        assert data["code"] == "rate_limiter_unavailable"
        assert "rate limiter" in data["detail"].lower()


@pytest.mark.asyncio
async def test_rate_limiter_error_with_unset_environment_fails_closed(client: AsyncClient, auth_headers: dict, monkeypatch):
    """When ENVIRONMENT is unset / empty, it defaults to production behavior (fails closed with 503)."""
    settings = get_settings()
    monkeypatch.setattr(settings, "ENVIRONMENT", "")
    monkeypatch.setattr(settings, "ENABLE_DEMO_SEEDING", True)

    with patch("backend.services.rate_limiter.get_pool", side_effect=Exception("DB unreachable")):
        resp = await client.post("/api/demo/seed-persona", headers=auth_headers, json={"tz": "UTC"})
        assert resp.status_code == 503
        assert resp.headers.get("retry-after") == "5"
        data = resp.json()
        assert data["code"] == "rate_limiter_unavailable"


@pytest.mark.asyncio
async def test_health_check_reports_degraded_when_db_ping_fails(client: AsyncClient):
    """When DB ping fails, /health reports db_connected=False and status='degraded' without leaking host/credentials."""
    class FailingPool:
        def acquire(self, *args, **kwargs):
            raise Exception("password authentication failed for user compass")

    with patch("backend.routers.admin.get_pool", return_value=FailingPool()):
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "degraded"
        assert data["db_connected"] is False

        # Ensure no credential or host leak
        for key, val in data.items():
            if isinstance(val, str):
                assert "password" not in val.lower()
                assert "ep-" not in val.lower()
                assert "@" not in val
                assert "postgresql://" not in val.lower()


@pytest.mark.asyncio
async def test_http_exception_handler_string_detail_unchanged(client: AsyncClient):
    """String detail in HTTPException remains completely unchanged (standard FastAPI shape)."""
    from fastapi import HTTPException
    from backend.main import app

    @app.get("/test/http-exception-string-detail")
    async def _route():
        raise HTTPException(status_code=400, detail="Invalid request parameters")

    resp = await client.get("/test/http-exception-string-detail")
    assert resp.status_code == 400
    assert resp.json() == {"detail": "Invalid request parameters"}


@pytest.mark.asyncio
async def test_http_exception_handler_dict_detail_flattened_and_headers_preserved(client: AsyncClient):
    """Dict detail in HTTPException is flattened into top-level JSON fields and custom headers are preserved."""
    from fastapi import HTTPException
    from backend.main import app

    @app.get("/test/http-exception-dict-detail")
    async def _route():
        raise HTTPException(
            status_code=503,
            detail={"code": "db_unavailable", "detail": "The server database is waking up."},
            headers={"Retry-After": "5", "X-Custom-Test": "preserved"},
        )

    resp = await client.get("/test/http-exception-dict-detail")
    assert resp.status_code == 503
    assert resp.headers.get("retry-after") == "5"
    assert resp.headers.get("x-custom-test") == "preserved"
    data = resp.json()
    assert data["code"] == "db_unavailable"
    assert data["detail"] == "The server database is waking up."


@pytest.mark.asyncio
async def test_http_exception_handler_dict_detail_without_detail_key_sets_code(client: AsyncClient):
    """When a dict detail has no 'detail' key, the handler sets 'detail' to its 'code'."""
    from fastapi import HTTPException
    from backend.main import app

    @app.get("/test/http-exception-dict-no-detail-key")
    async def _route():
        raise HTTPException(
            status_code=400,
            detail={"code": "missing_required_field", "field": "email"},
        )

    resp = await client.get("/test/http-exception-dict-no-detail-key")
    assert resp.status_code == 400
    data = resp.json()
    assert data["code"] == "missing_required_field"
    assert data["field"] == "email"
    assert data["detail"] == "missing_required_field"

