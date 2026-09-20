"""
Compass — Integration & Unit Test Suite for Conversation Memory Operations.

Validates:
  - Conversation creation and retrieval (get_or_create_conversation).
  - Adding messages and auto-generating conversation titles from user prompt (add_message).
  - Retrieving recent messages in chronological order (get_recent_messages).
  - Listing conversations with metadata, limit, user_id filtering, and parameter types (list_conversations).
  - Cross-conversation memory retrieval (get_cross_conversation_memory).
  - Deleting conversations and related messages (delete_conversation).
"""

import sys
import uuid
import pytest
import pytest_asyncio
import asyncpg
from pathlib import Path

# Add project root to sys.path
_project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_project_root))

from backend.config import get_settings
from backend.memory.conversations import (
    get_or_create_conversation,
    add_message,
    get_recent_messages,
    list_conversations,
    get_cross_conversation_memory,
    delete_conversation,
)

settings = get_settings()


@pytest_asyncio.fixture(scope="function")
async def db_conn():
    """Fixture providing an isolated PostgreSQL connection wrapped in a transaction that rolls back."""
    try:
        conn = await asyncpg.connect(settings.DATABASE_URL, timeout=15.0)
    except Exception as e:
        pytest.skip(f"PostgreSQL database not reachable at {settings.DATABASE_URL}: {e}")

    tr = conn.transaction()
    await tr.start()

    try:
        yield conn
    finally:
        await tr.rollback()
        await conn.close()


@pytest.mark.asyncio
async def test_conversation_lifecycle(db_conn):
    """Test full lifecycle: create, add messages, get recent, list, cross-memory, and delete."""
    test_user_id = f"test_user_{uuid.uuid4().hex[:8]}"

    # 1. Create a conversation
    cid = await get_or_create_conversation(db_conn, user_id=test_user_id)
    assert cid is not None
    # Validate UUID
    parsed_uuid = uuid.UUID(cid)
    assert str(parsed_uuid) == cid

    # 2. Add first user message - should auto-populate conversation title
    msg1 = await add_message(
        db_conn,
        conversation_id=cid,
        role="user",
        content="Hello, help me plan my work sprint today!",
    )
    assert msg1["role"] == "user"
    assert "Hello, help me plan my work sprint today!" in msg1["content"]

    # Add assistant response
    msg2 = await add_message(
        db_conn,
        conversation_id=cid,
        role="assistant",
        content="I'd be happy to help you plan your work sprint.",
        skill_called="scheduler",
    )
    assert msg2["role"] == "assistant"
    assert msg2["skill_called"] == "scheduler"

    # 3. get_recent_messages
    recent = await get_recent_messages(db_conn, conversation_id=cid, limit=10)
    assert len(recent) == 2
    assert recent[0]["role"] == "user"
    assert recent[1]["role"] == "assistant"

    # 4. list_conversations - validates that limit and user_id parameter types work as expected
    conv_list = await list_conversations(db_conn, limit=10, user_id=test_user_id)
    assert isinstance(conv_list, list)
    matching = [c for c in conv_list if c["id"] == cid]
    assert len(matching) == 1
    assert matching[0]["message_count"] == 2
    assert "Hello, help me plan" in matching[0]["title"]

    # 5. Cross-conversation memory
    # Create a second conversation to test cross-memory exclusion
    cid2 = await get_or_create_conversation(db_conn, user_id=test_user_id)
    await add_message(db_conn, conversation_id=cid2, role="user", content="What were we doing earlier?")

    cross_memories = await get_cross_conversation_memory(db_conn, exclude_conversation_id=cid2, limit=5)
    assert isinstance(cross_memories, list)
    # The message from cid should be present, but cid2 should be excluded
    assert not any(m.get("conversation_id") == uuid.UUID(cid2) for m in cross_memories)

    # 6. delete_conversation
    deleted = await delete_conversation(db_conn, cid)
    assert deleted is True

    # Verify messages and conversation are gone
    remaining = await get_recent_messages(db_conn, conversation_id=cid)
    assert len(remaining) == 0
    conv_list_after = await list_conversations(db_conn, limit=10, user_id=test_user_id)
    assert not any(c["id"] == cid for c in conv_list_after)


@pytest.mark.asyncio
async def test_list_conversations_mixed_type_params(db_conn):
    """Specifically test list_conversations with limit (int) and user_id (str) to ensure no type issues."""
    test_user_id = f"user_{uuid.uuid4().hex[:6]}"
    cid = await get_or_create_conversation(db_conn, user_id=test_user_id)
    await add_message(db_conn, conversation_id=cid, role="user", content="Test message for type safety check")

    # Run with limit as int and user_id as str
    res1 = await list_conversations(db_conn, limit=5, user_id=test_user_id)
    assert isinstance(res1, list)
    assert len(res1) >= 1

    # Run without user_id
    res2 = await list_conversations(db_conn, limit=5, user_id=None)
    assert isinstance(res2, list)
