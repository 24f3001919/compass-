"""
Security tests for conversation sharing (PR #108 hardening):
1. Database stores sha256(raw_token), never plaintext token.
2. Resolving with raw_token returns the conversation without share_token in public response.
3. Response headers include Cache-Control: no-store and X-Robots-Tag: noindex, nofollow.
4. Public response contains no user_id, no evidence, no internal task data.
5. Revoking the conversation (is_shared=False) causes GET /api/chat/shared/{token} -> 404.
6. Cross-tenant isolation: Tenant B cannot share or revoke Tenant A's conversation.
7. Transitional upgrade: Legacy plaintext token works on first access and is immediately re-hashed to sha256.
"""

import hashlib
import uuid
import pytest
from httpx import AsyncClient
from backend.memory.db import get_pool
from backend.memory import conversations


@pytest.mark.asyncio
async def test_share_token_hashed_storage_and_headers(client: AsyncClient):
    pool = await get_pool()
    if not pool:
        pytest.skip("Database pool not available")

    # Create two isolated identities
    user_a = f"tenant_a_{uuid.uuid4().hex[:8]}"
    user_b = f"tenant_b_{uuid.uuid4().hex[:8]}"

    async with pool.acquire() as conn:
        # Create conversation for User A
        conv_id = await conversations.get_or_create_conversation(conn, user_id=user_a, title="Confidential Architecture")

        # Add message with evidence and sensitive fields
        await conversations.add_message(
            conn,
            conversation_id=conv_id,
            role="user",
            content="How do we deploy the architecture securely?",
        )
        await conversations.add_message(
            conn,
            conversation_id=conv_id,
            role="assistant",
            content="Use mTLS, egress isolation, and secret encryption.",
            evidence={"internal_db_ip": "10.0.0.15", "cluster_secret": "supersecret"},
        )

        # 1. User A shares the conversation
        ok, raw_token = await conversations.update_conversation(conn, conv_id, is_shared=True)
        assert ok is True
        assert raw_token is not None

        # Verify DB stores SHA-256 hash of token, NOT raw_token
        expected_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        row = await conn.fetchrow("SELECT share_token, is_shared FROM conversations WHERE id = $1", uuid.UUID(conv_id))
        assert row["share_token"] == expected_hash
        assert row["share_token"] != raw_token
        assert row["is_shared"] is True

        # 2. Public fetch via raw_token succeeds
        resp = await client.get(f"/api/chat/shared/{raw_token}")
        assert resp.status_code == 200
        assert resp.headers["Cache-Control"] == "no-store, private"
        assert resp.headers["X-Robots-Tag"] == "noindex, nofollow"

        # Presenting the stored SHA-256 hash directly as the token MUST return 404
        resp_hash = await client.get(f"/api/chat/shared/{expected_hash}")
        assert resp_hash.status_code == 404, "Presenting stored hash directly must return 404"

        data = resp.json()
        assert data["title"] == "Confidential Architecture"
        assert len(data["messages"]) == 2

        # 3. Verify public payload privacy: NO share_token, NO user_id, NO evidence, NO task data
        assert "share_token" not in data, "Public shared response must not leak share_token"
        assert "user_id" not in data
        assert "guest_id" not in data
        for msg in data["messages"]:
            assert "user_id" not in msg
            assert "evidence" not in msg
            assert "internal_db_ip" not in str(msg)
            assert "cluster_secret" not in str(msg)

        # 4. Cross-tenant isolation: Tenant B cannot access, share, or revoke Tenant A's conversation
        has_access, err = await conversations.check_conversation_access(conn, conv_id, user_id=user_b)
        assert has_access is False
        assert "Forbidden" in err

        resp_b_revoke = await client.patch(
            f"/api/conversations/{conv_id}",
            json={"is_shared": False},
            headers={"x-user-id": user_b},
        )
        assert resp_b_revoke.status_code == 403, "Other tenant must be forbidden from revoking share"

        # 5. Revocation: User A revokes the share
        ok_revoke, _ = await conversations.update_conversation(conn, conv_id, is_shared=False)
        assert ok_revoke is True

        # Check DB share_token cleared
        revoked_row = await conn.fetchrow("SELECT share_token, is_shared FROM conversations WHERE id = $1", uuid.UUID(conv_id))
        assert revoked_row["share_token"] is None
        assert revoked_row["is_shared"] is False

        # Public access now returns 404
        resp_after_revoke = await client.get(f"/api/chat/shared/{raw_token}")
        assert resp_after_revoke.status_code == 404


@pytest.mark.asyncio
async def test_legacy_plaintext_share_token_rehashed_on_first_access(client: AsyncClient):
    """Transitional lookup:
    1. Legacy conversation with plaintext share_token in DB.
    2. Caller fetches with plaintext token.
    3. First access succeeds and immediately upgrades DB row to sha256(token).
    4. Subsequent access continues to work matching the new sha256 hash.
    """
    pool = await get_pool()
    if not pool:
        pytest.skip("Database pool not available")

    legacy_user = f"legacy_user_{uuid.uuid4().hex[:8]}"
    legacy_token = f"legacy-plain-token-{uuid.uuid4().hex}"
    expected_hash = hashlib.sha256(legacy_token.encode("utf-8")).hexdigest()

    async with pool.acquire() as conn:
        conv_id = await conversations.get_or_create_conversation(conn, user_id=legacy_user, title="Legacy Shared Chat")
        # Manually write legacy plaintext token to DB
        await conn.execute(
            "UPDATE conversations SET is_shared = TRUE, share_token = $1 WHERE id = $2",
            legacy_token,
            uuid.UUID(conv_id),
        )

        # Confirm DB holds plaintext
        db_before = await conn.fetchrow("SELECT share_token FROM conversations WHERE id = $1", uuid.UUID(conv_id))
        assert db_before["share_token"] == legacy_token

        # 1. First access with legacy token
        resp1 = await client.get(f"/api/chat/shared/{legacy_token}")
        assert resp1.status_code == 200
        assert resp1.json()["title"] == "Legacy Shared Chat"
        assert "share_token" not in resp1.json()

        # 2. Check DB: must have been upgraded to sha256!
        db_after = await conn.fetchrow("SELECT share_token FROM conversations WHERE id = $1", uuid.UUID(conv_id))
        assert db_after["share_token"] == expected_hash, "Legacy plaintext row must be upgraded to sha256 hash"

        # 3. Second access with same link works matching sha256
        resp2 = await client.get(f"/api/chat/shared/{legacy_token}")
        assert resp2.status_code == 200
        assert resp2.json()["title"] == "Legacy Shared Chat"
