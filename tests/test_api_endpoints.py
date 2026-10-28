"""
Compass — API Endpoint Tests.

Tests:
  - Root redirect (/ -> /docs).
  - Health check endpoint (/health).
  - Authentication checks (401 for unauthorized access).
  - Authenticated queries across all endpoints.
  - CORS header responses for frontend origin.
"""

import pytest
from httpx import AsyncClient


@pytest.fixture(autouse=True)
async def check_live_db_available(request):
    """Mark tests needing a live database with a clean skip when live server/database is not reachable."""
    if request.node.name.startswith("test_authenticated_endpoints"):
        from backend.memory.db import get_pool
        try:
            pool = await get_pool()
            if not pool:
                pytest.skip("Live server/database not available; skipping live endpoint integration test")
            async with pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
        except Exception:
            pytest.skip("Live server/database not available; skipping live endpoint integration test")


@pytest.mark.asyncio
async def test_root_redirect(client: AsyncClient):
    """GET / returns 200 in production/test or 307 to /docs in development."""
    resp = await client.get("/", follow_redirects=False)
    if resp.status_code == 307:
        assert resp.headers["location"] == "/docs"
    else:
        assert resp.status_code == 200
        assert resp.json().get("status") == "ok"


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    """GET /health should return 200 without auth."""
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("ok", "degraded")
    assert "db_connected" in data


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path",
    [
        "/tasks",
        "/projects",
        "/dashboard",
        "/memory/timeline",
        "/admin/usage",
    ],
)
async def test_auth_enforcement(client: AsyncClient, path: str):
    """Unauthenticated requests must return 401 Unauthorized or 403 Forbidden."""
    resp = await client.get(path)
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path",
    [
        "/tasks",
        "/projects",
        "/dashboard",
        "/memory/timeline",
        "/admin/usage",
    ],
)
async def test_authenticated_endpoints(client: AsyncClient, path: str, auth_headers: dict):
    """Authenticated requests should return 200 OK."""
    resp = await client.get(path, headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_cors_headers(client: AsyncClient):
    """OPTIONS request with Vite frontend origin should include CORS headers."""
    headers = {
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
    }
    resp = await client.options("/tasks", headers=headers)
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"


@pytest.mark.asyncio
async def test_admin_consolidate_endpoint(client: AsyncClient, auth_headers: dict):
    """POST /admin/consolidate requires auth and responds with consolidate metrics."""
    from unittest.mock import patch, AsyncMock
    # Unauthenticated
    resp_unauth = await client.post("/admin/consolidate", json={"dry_run": True})
    assert resp_unauth.status_code in (401, 403)

    # Authenticated dry-run with run_consolidation mocked
    fake_report = {
        "overdue_tasks_flagged": 0,
        "duplicate_chunks_merged": 0,
        "stale_conversations_rolled_up": 0,
    }
    with patch("backend.jobs.consolidate.run_consolidation", AsyncMock(return_value=fake_report)):
        resp = await client.post("/admin/consolidate", headers=auth_headers, json={"dry_run": True})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["dry_run"] is True
        assert "overdue_tasks_flagged" in data
        assert "duplicate_chunks_merged" in data
        assert "stale_conversations_rolled_up" in data


@pytest.mark.asyncio
async def test_shared_conversation_endpoint_deleted_returns_404(client: AsyncClient):
    """GET /api/share/{id} was completely removed and returns 404."""
    fake_id = "00000000-0000-0000-0000-000000000000"
    resp = await client.get(f"/api/share/{fake_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_specialist_dispatch_endpoint_deleted_returns_404(client: AsyncClient):
    """POST /api/specialist/dispatch was completely removed and returns 404."""
    resp = await client.post("/api/specialist/dispatch", json={"capability": "memory", "user_goal": "test"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_admin_consolidate_rejects_guest_token(client: AsyncClient):
    """A valid guest token must not authorize admin endpoints, and the job must not run."""
    from unittest.mock import patch, AsyncMock
    from backend.dependencies import generate_guest_token
    _, guest_token = generate_guest_token()

    with patch("backend.jobs.consolidate.run_consolidation", AsyncMock(return_value={})) as run_mock:
        for headers in (
            {"Authorization": f"Bearer {guest_token}"},
            {"x-guest-token": guest_token},
        ):
            resp = await client.post("/admin/consolidate", headers=headers, json={"dry_run": True})
            assert resp.status_code in (401, 403), headers
        run_mock.assert_not_called()
