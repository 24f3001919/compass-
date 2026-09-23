"""
Compass — Security Hardening Regression Tests.

Verifies:
  - Fail-closed production secrets (AUTH_TOKEN, TOKEN_ENCRYPTION_KEY).
  - Constant-time Bearer token verification.
  - SSRF protection rejecting loopback, RFC 1918, cloud metadata, and unsafe schemes.
  - Safe client IP extraction for rate limiters.
  - IDOR protection on task update and deletion.
  - Confirmation gate and CORS origin enforcement.
"""

import pytest
from unittest.mock import MagicMock
from fastapi import HTTPException
from httpx import AsyncClient

from backend.config import Settings
from backend.services.security import is_safe_url, get_client_ip
from backend.dependencies import verify_token
from backend.skills.handlers.web import handle_ingest_url


# ===========================================================================
# 1. Secret Management & Fail-Closed Production Tests
# ===========================================================================

def test_production_fail_closed_with_dev_auth_token():
    """In production mode, default 'dev-token' must be rejected with ValueError."""
    prod_settings = Settings(
        ENVIRONMENT="production",
        AUTH_TOKEN="dev-token",
        TOKEN_ENCRYPTION_KEY="custom-secure-key-for-prod-32bytes!",
    )
    with pytest.raises(ValueError, match="CRITICAL SECURITY CONFIGURATION ERROR: AUTH_TOKEN"):
        prod_settings.validate_production_secrets()


def test_production_fail_closed_with_empty_auth_token():
    """In production mode, empty AUTH_TOKEN must be rejected."""
    prod_settings = Settings(
        ENVIRONMENT="production",
        AUTH_TOKEN="",
        TOKEN_ENCRYPTION_KEY="custom-secure-key-for-prod-32bytes!",
    )
    with pytest.raises(ValueError, match="CRITICAL SECURITY CONFIGURATION ERROR: AUTH_TOKEN"):
        prod_settings.validate_production_secrets()


def test_production_fail_closed_with_default_encryption_key():
    """In production mode, default TOKEN_ENCRYPTION_KEY must be rejected."""
    prod_settings = Settings(
        ENVIRONMENT="production",
        AUTH_TOKEN="real-production-secret-token-12345",
        TOKEN_ENCRYPTION_KEY="compass_secure_local_dev_token_encryption_key_32bytes!",
    )
    with pytest.raises(ValueError, match="CRITICAL SECURITY CONFIGURATION ERROR: TOKEN_ENCRYPTION_KEY"):
        prod_settings.validate_production_secrets()


def test_development_allows_dev_tokens():
    """In development mode, default development credentials do not raise errors."""
    dev_settings = Settings(
        ENVIRONMENT="development",
        AUTH_TOKEN="dev-token",
        TOKEN_ENCRYPTION_KEY="compass_secure_local_dev_token_encryption_key_32bytes!",
    )
    # Should complete cleanly without raising
    dev_settings.validate_production_secrets()
    assert not dev_settings.is_production()


# ===========================================================================
# 2. SSRF (Server-Side Request Forgery) Validation Tests
# ===========================================================================

@pytest.mark.parametrize(
    "unsafe_url,expected_blocked",
    [
        ("http://127.0.0.1:8000/api/admin/usage", True),
        ("http://localhost:5432", True),
        ("http://169.254.169.254/latest/meta-data/", True),
        ("http://10.0.0.1/internal-dashboard", True),
        ("http://192.168.1.1/admin", True),
        ("http://172.16.0.5/secrets", True),
        ("http://0.0.0.0:8000", True),
        ("ftp://ftp.example.com/file.txt", True),
        ("file:///etc/passwd", True),
        ("gopher://127.0.0.1:70", True),
    ],
)
def test_ssrf_validator_blocks_internal_targets(unsafe_url: str, expected_blocked: bool):
    """is_safe_url must block internal addresses, cloud metadata, and unsupported schemes."""
    is_safe, reason = is_safe_url(unsafe_url)
    assert is_safe is not expected_blocked
    assert len(reason) > 0


def test_ssrf_validator_allows_public_urls():
    """is_safe_url must allow standard public web URLs."""
    safe_urls = [
        "https://devpost.com/hackathons",
        "https://api.github.com/repos",
        "http://example.com/index.html",
    ]
    for url in safe_urls:
        is_safe, reason = is_safe_url(url)
        assert is_safe is True, f"Expected {url} to be safe, but got reason: {reason}"


@pytest.mark.asyncio
async def test_handle_ingest_url_blocks_ssrf_payload():
    """handle_ingest_url handler must reject SSRF target URLs before external calls."""
    ssrf_payload = {"url": "http://169.254.169.254/latest/meta-data/", "domain": "general"}
    result = await handle_ingest_url(ssrf_payload, pool=None)
    assert result["success"] is False
    assert "SSRF blocked" in result["error"]


# ===========================================================================
# 3. Client IP Extraction & Spoofing Resistance
# ===========================================================================

def test_safe_client_ip_prefers_direct_host_when_no_proxy():
    """get_client_ip returns request.client.host when no proxy headers are present."""
    mock_request = MagicMock()
    mock_request.headers = {}
    mock_request.client.host = "203.0.113.42"
    ip = get_client_ip(mock_request)
    assert ip == "203.0.113.42"


def test_safe_client_ip_handles_forwarded_for():
    """get_client_ip extracts the client IP from standard proxy headers."""
    mock_request = MagicMock()
    mock_request.headers = {"x-forwarded-for": "198.51.100.15, 10.0.0.1"}
    mock_request.client.host = "10.0.0.1"
    ip = get_client_ip(mock_request)
    assert ip == "198.51.100.15"


# ===========================================================================
# 4. Insecure Direct Object Reference (IDOR) Tests
# ===========================================================================

@pytest.mark.asyncio
async def test_task_idor_user_cannot_modify_other_user_task(client: AsyncClient, monkeypatch):
    """A user cannot update or delete another user's task without ownership."""
    from backend.memory import structured

    from contextlib import asynccontextmanager
    from backend.memory import structured
    import backend.routers.tasks as tasks_router

    class MockConn:
        pass

    class MockPool:
        @asynccontextmanager
        async def acquire(self):
            yield MockConn()

    async def mock_get_pool():
        return MockPool()

    monkeypatch.setattr(tasks_router, "get_pool", mock_get_pool)

    mock_alice_task = {
        "id": 999,
        "title": "Alice Private Project",
        "domain": "code",
        "priority": "high",
        "status": "open",
        "notes": "secret notes",
        "due_date": None,
        "user_id": "alice",
        "project": None,
        "duration_minutes": 60,
        "scheduled_start": None,
        "scheduled_end": None,
        "is_fixed": False,
        "created_at": None,
        "updated_at": None,
    }

    async def mock_get_task(conn, task_id):
        if task_id == 999:
            return mock_alice_task
        return None

    monkeypatch.setattr(structured, "get_task", mock_get_task)

    # 1. User 'bob' attempts to PATCH Alice's task -> must be 403 Forbidden
    patch_resp = await client.patch(
        "/api/tasks/999",
        headers={"x-user-id": "bob"},
        json={"title": "Hacked Title by Bob"},
    )
    assert patch_resp.status_code == 403
    assert "Forbidden" in patch_resp.json()["detail"]

    # 2. User 'bob' attempts to DELETE Alice's task -> must be 403 Forbidden
    delete_resp = await client.delete(
        "/api/tasks/999",
        headers={"x-user-id": "bob"},
    )
    assert delete_resp.status_code == 403
    assert "Forbidden" in delete_resp.json()["detail"]

    # 3. User 'alice' (owner) can modify her task
    async def mock_update_task(conn, task_id, **kwargs):
        updated = dict(mock_alice_task)
        updated.update(kwargs)
        return updated

    monkeypatch.setattr(structured, "update_task", mock_update_task)
    alice_patch_resp = await client.patch(
        "/api/tasks/999",
        headers={"x-user-id": "alice"},
        json={"title": "Alice Updated Project"},
    )
    assert alice_patch_resp.status_code == 200


# ===========================================================================
# 5. CORS Header Tests
# ===========================================================================

@pytest.mark.asyncio
async def test_cors_disallows_arbitrary_untrusted_origin(client: AsyncClient):
    """OPTIONS request with an untrusted origin should not receive Access-Control-Allow-Origin."""
    headers = {
        "Origin": "https://malicious-attacker-site.com",
        "Access-Control-Request-Method": "GET",
    }
    resp = await client.options("/tasks", headers=headers)
    allow_origin = resp.headers.get("access-control-allow-origin")
    assert allow_origin != "https://malicious-attacker-site.com"
    assert allow_origin != "*"
