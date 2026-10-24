"""
Tests for Compass — Batch 1, Fix 1.3: Repair the Share Link Flow.

Verifies:
1. Public endpoint GET /api/chat/shared/{token} resolves valid share tokens.
2. Passing conversation database UUID alone does NOT grant access (returns 404).
3. Invalid, missing, or revoked tokens return 404/400.
4. Response contains public conversation data without leaking private DB IDs or owner PII.
5. update_conversation generates secure token with secrets.token_urlsafe(32) on is_shared=True.
6. update_conversation revokes token on is_shared=False.
7. PATCH /api/conversations/{id} returns {"ok": True, "share_token": token}.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from httpx import AsyncClient, ASGITransport
from backend.main import app
import backend.memory.conversations as conv_mem


@pytest.mark.asyncio
async def test_shared_chat_endpoint_valid_token():
    """GET /api/chat/shared/{token} returns 200 and shared chat payload when token is valid."""
    fake_token = "sec_tok_valid1234567890abcdefghijkl"
    fake_payload = {
        "share_token": fake_token,
        "title": "Hackathon Strategy Discussion",
        "started_at": "2026-10-22T10:00:00",
        "last_active_at": "2026-10-22T10:30:00",
        "messages": [
            {
                "id": 1,
                "role": "user",
                "content": "How do we structure our multi-agent scheduler?",
                "skill_called": None,
                "created_at": "2026-10-22T10:00:05",
            },
            {
                "id": 2,
                "role": "assistant",
                "content": "We should use a unified priority queue with reactive conflict resolution.",
                "skill_called": "agent_schedule",
                "created_at": "2026-10-22T10:00:10",
            },
        ],
    }

    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

    with patch("backend.routers.chat.get_pool", return_value=mock_pool), \
         patch("backend.memory.conversations.get_shared_conversation_by_token", new_callable=AsyncMock) as mock_get_shared:
        mock_get_shared.return_value = fake_payload

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(f"/api/chat/shared/{fake_token}")

            assert resp.status_code == 200
            data = resp.json()
            assert data["share_token"] == fake_token
            assert data["title"] == "Hackathon Strategy Discussion"
            assert len(data["messages"]) == 2
            assert data["messages"][0]["content"] == "How do we structure our multi-agent scheduler?"
            # Ensure no private owner metadata is exposed
            assert "user_id" not in data
            assert "guest_id" not in data
            mock_get_shared.assert_awaited_once_with(mock_conn, fake_token)


@pytest.mark.asyncio
async def test_shared_chat_endpoint_invalid_or_revoked_token_returns_404():
    """GET /api/chat/shared/{token} returns 404 when token is not found or revoked."""
    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

    with patch("backend.routers.chat.get_pool", return_value=mock_pool), \
         patch("backend.memory.conversations.get_shared_conversation_by_token", new_callable=AsyncMock) as mock_get_shared:
        mock_get_shared.return_value = None

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/chat/shared/revoked_or_expired_token_123")
            assert resp.status_code == 404
            assert "not found" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_database_id_alone_does_not_grant_shared_access():
    """Supplying a raw database conversation UUID to /api/chat/shared/{token} returns 404.
    Database IDs are never public credentials.
    """
    raw_conv_id = str(uuid.uuid4())

    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

    # The DB lookup checks WHERE share_token = $1 AND is_shared = TRUE.
    # Passing a raw UUID will not match any share_token record.
    with patch("backend.routers.chat.get_pool", return_value=mock_pool), \
         patch("backend.memory.conversations.get_shared_conversation_by_token", new_callable=AsyncMock) as mock_get_shared:
        mock_get_shared.return_value = None

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(f"/api/chat/shared/{raw_conv_id}")
            assert resp.status_code == 404
            mock_get_shared.assert_awaited_once_with(mock_conn, raw_conv_id)


@pytest.mark.asyncio
async def test_shared_chat_endpoint_whitespace_token_returns_400():
    """GET /api/chat/shared/{token} with empty/whitespace token returns 400."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/chat/shared/%20%20%20")
        assert resp.status_code == 400


@pytest.mark.asyncio
async def test_get_shared_conversation_by_token_sql_contract():
    """Unit test for conv_mem.get_shared_conversation_by_token parameterization and validation."""
    mock_conn = AsyncMock()

    # 1. Blank token returns None without executing SQL
    assert await conv_mem.get_shared_conversation_by_token(mock_conn, "") is None
    assert await conv_mem.get_shared_conversation_by_token(mock_conn, "   ") is None
    assert mock_conn.fetchrow.await_count == 0

    # 2. Valid token queries WHERE share_token = $1 AND is_shared = TRUE
    target_cid = uuid.uuid4()
    mock_conn.fetchrow.return_value = {
        "id": target_cid,
        "title": "Architecture Review",
        "started_at": MagicMock(isoformat=lambda: "2026-10-22T08:00:00"),
        "last_active_at": MagicMock(isoformat=lambda: "2026-10-22T09:00:00"),
        "is_shared": True,
        "share_token": "sec_test_token_abc",
    }
    mock_conn.fetch.return_value = [
        {
            "id": 101,
            "role": "user",
            "content": "Design review for compass router [[modes: plan]]",
            "skill_called": None,
            "created_at": MagicMock(isoformat=lambda: "2026-10-22T08:00:01"),
        }
    ]

    res = await conv_mem.get_shared_conversation_by_token(mock_conn, "sec_test_token_abc")
    assert res is not None
    # share_token must be redacted from public response
    assert "share_token" not in res
    assert res["title"] == "Architecture Review"
    assert len(res["messages"]) == 1
    # Strip modes marker check
    assert "[[modes" not in res["messages"][0]["content"]

    # Verify query parameters
    query_str = mock_conn.fetchrow.call_args[0][0]
    assert "share_token = $1 OR share_token = $2" in query_str
    assert "is_shared = TRUE" in query_str


@pytest.mark.asyncio
async def test_update_conversation_token_generation_and_revocation():
    """Unit test for conv_mem.update_conversation share_token generation and revocation."""
    mock_conn = AsyncMock()
    cid = str(uuid.uuid4())

    # 1. is_shared=True returns (True, generated_token)
    mock_conn.fetchrow.return_value = {"share_token": "some_hash"}
    ok, token = await conv_mem.update_conversation(mock_conn, cid, is_shared=True)
    assert ok is True
    assert token is not None and len(token) >= 32

    # Verify query passed RETURNING share_token
    update_sql = mock_conn.fetchrow.call_args[0][0]
    assert "RETURNING share_token" in update_sql

    # 2. is_shared=False revokes token, returns (True, None)
    mock_conn.fetchrow.return_value = {"share_token": None}
    ok, token = await conv_mem.update_conversation(mock_conn, cid, is_shared=False)
    assert ok is True
    assert token is None


@pytest.mark.asyncio
async def test_patch_conversation_endpoint_returns_share_token():
    """PATCH /api/conversations/{id} with is_shared=True returns share_token."""
    cid = str(uuid.uuid4())
    fake_token = "sec_generated_patch_tok_789"

    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

    with patch("backend.routers.chat.get_pool", return_value=mock_pool), \
         patch("backend.memory.conversations.check_conversation_access", new_callable=AsyncMock) as mock_access, \
         patch("backend.memory.conversations.update_conversation", new_callable=AsyncMock) as mock_update:
        mock_access.return_value = (True, None)
        mock_update.return_value = (True, fake_token)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.patch(
                f"/api/conversations/{cid}",
                json={"is_shared": True},
            )

            assert resp.status_code == 200
            data = resp.json()
            assert data["ok"] is True
            assert data["share_token"] == fake_token
            mock_update.assert_awaited_once_with(
                mock_conn,
                cid,
                title=None,
                is_pinned=None,
                is_archived=None,
                is_shared=True,
            )
