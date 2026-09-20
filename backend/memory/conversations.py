"""
Compass — Conversation & Message Storage Operations.

Provides database access for chat conversations and message history in PostgreSQL.
"""

from typing import Optional, Union, List, Dict, Any
import uuid
import asyncpg
from asyncpg.pool import PoolConnectionProxy

DbConn = Union[asyncpg.Connection, PoolConnectionProxy]


async def get_or_create_conversation(
    conn: DbConn,
    conversation_id: Optional[str] = None,
    user_id: Optional[str] = None,
    title: Optional[str] = None,
) -> str:
    """Validate or create a conversation record, returning its UUID as string."""
    if conversation_id:
        try:
            cid = uuid.UUID(conversation_id)
            row = await conn.fetchrow(
                "SELECT id FROM conversations WHERE id = $1",
                cid
            )
            if row:
                await conn.execute(
                    "UPDATE conversations SET last_active_at = now() WHERE id = $1",
                    cid
                )
                return str(row["id"])
        except (ValueError, TypeError):
            pass

    # Create new conversation
    try:
        row = await conn.fetchrow(
            """
            INSERT INTO conversations (title, user_id)
            VALUES ($1, $2)
            RETURNING id
            """,
            title, user_id
        )
    except Exception:
        # Fallback if title/user_id columns don't exist yet
        row = await conn.fetchrow(
            "INSERT INTO conversations DEFAULT VALUES RETURNING id"
        )

    if row is not None:
        return str(row["id"])
    return str(uuid.uuid4())


async def add_message(
    conn: DbConn,
    conversation_id: str,
    role: str,
    content: str,
    skill_called: Optional[str] = None,
) -> dict:
    """Insert a message into the conversation history and update title if first user message."""
    cid = uuid.UUID(conversation_id)
    row = await conn.fetchrow(
        """
        INSERT INTO messages (conversation_id, role, content, skill_called)
        VALUES ($1, $2, $3, $4)
        RETURNING id, conversation_id, role, content, skill_called, created_at
        """,
        cid, role, content, skill_called
    )
    await conn.execute(
        "UPDATE conversations SET last_active_at = now() WHERE id = $1",
        cid
    )

    # Set conversation title if it's the first user message
    if role == "user":
        try:
            clean_title = content.strip().replace("\n", " ")
            if len(clean_title) > 60:
                clean_title = clean_title[:57] + "..."
            await conn.execute(
                """
                UPDATE conversations
                SET title = COALESCE(title, $2)
                WHERE id = $1 AND (title IS NULL OR title = '' OR title = 'New Chat')
                """,
                cid, clean_title
            )
        except Exception:
            pass

    return dict(row) if row else {}


async def get_recent_messages(
    conn: DbConn,
    conversation_id: str,
    limit: int = 50,
) -> list[dict]:
    """Retrieve message history for a conversation, ordered chronologically."""
    try:
        cid = uuid.UUID(conversation_id)
    except (ValueError, TypeError):
        return []

    rows = await conn.fetch(
        """
        SELECT id, role, content, skill_called, created_at
        FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC, id ASC
        LIMIT $2
        """,
        cid, limit
    )
    return [dict(r) for r in rows]


async def list_conversations(
    conn: DbConn,
    limit: int = 30,
    user_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Retrieve list of previous conversations with metadata and last message preview."""
    try:
        # Check if title column exists
        has_title_col = await conn.fetchval(
            """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'conversations' AND column_name = 'title'
            )
            """
        )

        title_expr = "c.title" if has_title_col else "NULL"
        has_user_col = await conn.fetchval(
            """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'conversations' AND column_name = 'user_id'
            )
            """
        )

        query = f"""
            SELECT c.id, c.started_at, c.last_active_at,
                   {title_expr} AS title,
                   COUNT(m.id) AS message_count,
                   (
                       SELECT content FROM messages
                       WHERE conversation_id = c.id AND role = 'user'
                       ORDER BY created_at ASC, id ASC LIMIT 1
                   ) AS first_user_msg,
                   (
                       SELECT content FROM messages
                       WHERE conversation_id = c.id
                       ORDER BY created_at DESC, id DESC LIMIT 1
                   ) AS last_msg
            FROM conversations c
            LEFT JOIN messages m ON m.conversation_id = c.id
        """

        params = []
        if user_id and has_user_col:
            query += " WHERE c.user_id = $1 OR c.user_id IS NULL "
            params.append(user_id)

        query += f"""
            GROUP BY c.id, c.started_at, c.last_active_at {', c.title' if has_title_col else ''}
            ORDER BY c.last_active_at DESC
            LIMIT ${len(params) + 1}
        """
        params.append(limit)

        rows = await conn.fetch(query, *params)
        conversations_list = []
        for r in rows:
            title = r.get("title") or r.get("first_user_msg") or "Chat Session"
            if len(title) > 60:
                title = title[:57] + "..."
            conversations_list.append({
                "id": str(r["id"]),
                "title": title,
                "started_at": r["started_at"].isoformat() if hasattr(r["started_at"], "isoformat") else str(r["started_at"]),
                "last_active_at": r["last_active_at"].isoformat() if hasattr(r["last_active_at"], "isoformat") else str(r["last_active_at"]),
                "message_count": int(r["message_count"] or 0),
                "preview": (r.get("last_msg") or "")[:120],
            })
        return conversations_list
    except Exception as e:
        return []


async def delete_conversation(
    conn: DbConn,
    conversation_id: str,
) -> bool:
    """Delete a conversation and all its messages."""
    try:
        cid = uuid.UUID(conversation_id)
        await conn.execute("DELETE FROM messages WHERE conversation_id = $1", cid)
        await conn.execute("DELETE FROM conversations WHERE id = $1", cid)
        return True
    except Exception:
        return False


async def get_cross_conversation_memory(
    conn: DbConn,
    exclude_conversation_id: Optional[str] = None,
    limit: int = 6,
) -> List[Dict[str, Any]]:
    """Retrieve messages and decisions from prior conversations for cross-session recall."""
    try:
        query = """
            SELECT m.role, m.content, m.created_at, c.id AS conversation_id
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
        """
        params = []
        if exclude_conversation_id:
            try:
                cid = uuid.UUID(exclude_conversation_id)
                query += " WHERE c.id != $1 "
                params.append(cid)
            except (ValueError, TypeError):
                pass

        query += f" ORDER BY m.created_at DESC LIMIT ${len(params) + 1}"
        params.append(limit)

        rows = await conn.fetch(query, *params)
        return [dict(r) for r in reversed(rows)]
    except Exception:
        return []

