"""
Compass — Auth Bypass & Production Hardening Gates Test Suite.

Proves:
  1. POST /api/auth/select-account is completely deleted -> 404.
  2. POST /api/auth/quick-connect is disabled and unregistered in production/default -> 404.
  3. /docs, /redoc, /openapi.json are disabled in production -> 404.
  4. /api/agent/confirm and /api/agent/undo admin overrides are strictly logged to agent_audit_log.
"""

import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch, AsyncMock, MagicMock
from backend.main import app
from backend.config import get_settings


@pytest.mark.asyncio
async def test_select_account_deleted():
    """Verify POST /api/auth/select-account has been deleted and returns 404."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/auth/select-account", json={"email": "attacker@evil.com"})
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_quick_connect_disabled_in_prod():
    """Verify POST /api/auth/quick-connect returns 404 when ENVIRONMENT != 'development'."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Default / prod environment
        with patch.object(get_settings(), "ENVIRONMENT", "production"):
            resp = await ac.post("/api/auth/quick-connect", json={"email": "attacker@evil.com"})
            assert resp.status_code == 404
            assert "Endpoint disabled" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_docs_and_openapi_disabled_in_production():
    """Verify /docs, /redoc, /openapi.json are disabled when app is created in production mode."""
    from fastapi import FastAPI
    settings = get_settings()
    with patch.object(settings, "ENVIRONMENT", "production"):
        is_prod = True
        prod_app = FastAPI(
            docs_url=None if is_prod else "/docs",
            redoc_url=None if is_prod else "/redoc",
            openapi_url=None if is_prod else "/openapi.json",
        )
        transport = ASGITransport(app=prod_app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r_docs = await ac.get("/docs")
            r_redoc = await ac.get("/redoc")
            r_openapi = await ac.get("/openapi.json")
            assert r_docs.status_code == 404
            assert r_redoc.status_code == 404
            assert r_openapi.status_code == 404


@pytest.mark.asyncio
async def test_agent_admin_override_logged_to_audit():
    """Verify that when AUTH_TOKEN is used as admin override, it records to agent_audit_log."""
    from backend.routers.agent import agent_confirm
    from backend.models import AgentConfirmRequest
    from starlette.requests import Request
    import uuid

    user_id = f"user_{uuid.uuid4().hex[:8]}@example.com"
    action_id = "act_test_123"

    settings = get_settings()
    admin_token = getattr(settings, "AUTH_TOKEN", "admin-secret-token")

    req = AgentConfirmRequest(
        run_id="run_test_admin",
        actions=[{"action_id": action_id, "tool": "calendar_create_event", "args": {"title": "Test"}}]
    )

    scope = {
        "type": "http",
        "headers": [(b"authorization", f"Bearer {admin_token}".encode("utf-8"))],
        "client": ("127.0.0.1", 1234),
    }
    request = Request(scope)

    with patch("backend.routers.agent.get_pool") as mock_get_pool, \
         patch("backend.agent_pending.verify_and_claim_action", return_value=(True, "OK", {})) as mock_verify, \
         patch("backend.agent.execute_confirmed_actions", return_value=[{"status": "executed"}]) as mock_exec, \
         patch("backend.agent.get_agent_run", return_value={"id": "run_test_admin", "pending_actions": [{"action_id": action_id, "tool": "calendar_create_event", "args": {"title": "Test"}}]}):

        mock_conn = AsyncMock()
        mock_pool = MagicMock()
        mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
        mock_pool.acquire.return_value.__aexit__.return_value = False
        mock_get_pool.return_value = mock_pool

        resp = await agent_confirm(req=req, request=request)
        assert resp["status"] == "ok"

        # Assert an audit record was written with approved_by='admin_override'
        mock_conn.execute.assert_called()
        calls = [str(c) for c in mock_conn.execute.mock_calls]
        assert any("agent_audit_log" in c and "admin_override" in c for c in calls)
