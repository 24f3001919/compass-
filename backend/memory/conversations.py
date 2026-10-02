"""
Compass — Conversation & Message Storage Operations.

Provides database access for chat conversations and message history in PostgreSQL.
"""

from typing import Optional, Union, List, Dict, Any
import logging
import uuid
import asyncpg
from asyncpg.pool import PoolConnectionProxy

logger = logging.getLogger("compass.conversations")

DbConn = Union[asyncpg.Connection, PoolConnectionProxy]


async def get_or_create_conversation(
    conn: DbConn,
    conversation_id: Optional[str] = None,
    user_id: Optional[str] = None,
    guest_id: Optional[str] = None,
    title: Optional[str] = None,
) -> str:
    """Validate or create a conversation record, returning its UUID as string.
    Ensures ownership is assigned to user_id or guest_id.
    """
    has_guest_col = await conn.fetchval(
        """
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'conversations' AND column_name = 'guest_id'
        )
        """
    )

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
            else:
                try:
                    if has_guest_col:
                        ins_row = await conn.fetchrow(
                            """
                            INSERT INTO conversations (id, title, user_id, guest_id)
                            VALUES ($1, $2, $3, $4)
                            RETURNING id
                            """,
                            cid, title, user_id, guest_id if not user_id else None
                        )
                    else:
                        ins_row = await conn.fetchrow(
                            """
                            INSERT INTO conversations (id, title, user_id)
                            VALUES ($1, $2, $3)
                            RETURNING id
                            """,
                            cid, title, user_id
                        )
                    if ins_row:
                        return str(ins_row["id"])
                except Exception:
                    try:
                        ins_row = await conn.fetchrow(
                            "INSERT INTO conversations (id) VALUES ($1) RETURNING id",
                            cid
                        )
                        if ins_row:
                            return str(ins_row["id"])
                    except Exception:
                        pass
        except (ValueError, TypeError):
            pass

    # Create new conversation
    try:
        if has_guest_col:
            row = await conn.fetchrow(
                """
                INSERT INTO conversations (title, user_id, guest_id)
                VALUES ($1, $2, $3)
                RETURNING id
                """,
                title, user_id, guest_id if not user_id else None
            )
        else:
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
    guest_id: Optional[str] = None,
    include_archived: bool = False,
) -> List[Dict[str, Any]]:
    """Retrieve list of previous conversations with metadata, pinned state, and last message preview.
    Strictly isolates authenticated user chats from anonymous guest chats.
    """
    try:
        # Check column existence safely
        has_title_col = await conn.fetchval(
            """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'conversations' AND column_name = 'title'
            )
            """
        )
        has_user_col = await conn.fetchval(
            """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'conversations' AND column_name = 'user_id'
            )
            """
        )
        has_guest_col = await conn.fetchval(
            """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'conversations' AND column_name = 'guest_id'
            )
            """
        )
        has_pinned_col = await conn.fetchval(
            """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'conversations' AND column_name = 'is_pinned'
            )
            """
        )
        has_archived_col = await conn.fetchval(
            """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'conversations' AND column_name = 'is_archived'
            )
            """
        )

        title_expr = "c.title" if has_title_col else "NULL"
        pinned_expr = "c.is_pinned" if has_pinned_col else "FALSE"
        archived_expr = "c.is_archived" if has_archived_col else "FALSE"

        query = f"""
            SELECT c.id, c.started_at, c.last_active_at,
                   {title_expr} AS title,
                   {pinned_expr} AS is_pinned,
                   {archived_expr} AS is_archived,
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

        where_clauses = []
        params: List[Any] = []

        if user_id and has_user_col:
            params.append(user_id)
            where_clauses.append(f"c.user_id = ${len(params)}")
        elif guest_id and has_guest_col:
            params.append(guest_id)
            where_clauses.append(f"(c.guest_id = ${len(params)} AND c.user_id IS NULL)")
        else:
            if has_guest_col:
                where_clauses.append("(c.user_id IS NULL AND (c.guest_id IS NULL OR c.guest_id = ''))")
            elif has_user_col:
                where_clauses.append("c.user_id IS NULL")

        if not include_archived and has_archived_col:
            where_clauses.append("(c.is_archived = FALSE OR c.is_archived IS NULL)")

        if where_clauses:
            query += f" WHERE {' AND '.join(where_clauses)} "


        group_cols = ["c.id", "c.started_at", "c.last_active_at"]
        if has_title_col:
            group_cols.append("c.title")
        if has_pinned_col:
            group_cols.append("c.is_pinned")
        if has_archived_col:
            group_cols.append("c.is_archived")

        order_by = "ORDER BY c.is_pinned DESC, c.last_active_at DESC" if has_pinned_col else "ORDER BY c.last_active_at DESC"

        query += f"""
            GROUP BY {', '.join(group_cols)}
            {order_by}
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
                "is_pinned": bool(r.get("is_pinned", False)),
                "is_archived": bool(r.get("is_archived", False)),
                "started_at": r["started_at"].isoformat() if hasattr(r["started_at"], "isoformat") else str(r["started_at"]),
                "last_active_at": r["last_active_at"].isoformat() if hasattr(r["last_active_at"], "isoformat") else str(r["last_active_at"]),
                "message_count": int(r["message_count"] or 0),
                "preview": (r.get("last_msg") or "")[:120],
            })
        return conversations_list
    except Exception as e:
        return []


async def update_conversation(
    conn: DbConn,
    conversation_id: str,
    title: Optional[str] = None,
    is_pinned: Optional[bool] = None,
    is_archived: Optional[bool] = None,
    is_shared: Optional[bool] = None,
) -> bool:
    """Update title, pinned status, archive status, or shared status of a conversation."""
    try:
        cid = uuid.UUID(conversation_id)
        updates: List[str] = []
        params: List[Any] = [cid]

        if title is not None:
            clean_title = title.strip()[:100]
            params.append(clean_title)
            updates.append(f"title = ${len(params)}")

        if is_pinned is not None:
            has_pinned = await conn.fetchval(
                "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'is_pinned')"
            )
            if not has_pinned:
                await conn.execute("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE")
            params.append(bool(is_pinned))
            updates.append(f"is_pinned = ${len(params)}")

        if is_archived is not None:
            has_archived = await conn.fetchval(
                "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'is_archived')"
            )
            if not has_archived:
                await conn.execute("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE")
            params.append(bool(is_archived))
            updates.append(f"is_archived = ${len(params)}")

        if is_shared is not None:
            has_shared = await conn.fetchval(
                "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'is_shared')"
            )
            if not has_shared:
                await conn.execute("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT FALSE")
            params.append(bool(is_shared))
            updates.append(f"is_shared = ${len(params)}")

        if not updates:
            return True

        query = f"UPDATE conversations SET {', '.join(updates)} WHERE id = $1"
        await conn.execute(query, *params)
        return True
    except Exception as e:
        logger.error(f"update_conversation failed: {e}", exc_info=True)
        return False


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
    user_id: Optional[str] = None,
    guest_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Retrieve messages and decisions from prior conversations for cross-session recall."""
    try:
        where_clauses = []
        params: List[Any] = []
        if exclude_conversation_id:
            try:
                cid = uuid.UUID(exclude_conversation_id)
                where_clauses.append(f"c.id != ${len(params) + 1}")
                params.append(cid)
            except (ValueError, TypeError):
                pass

        if user_id:
            where_clauses.append(f"c.user_id = ${len(params) + 1}")
            params.append(user_id)
        elif guest_id:
            where_clauses.append(f"(c.guest_id = ${len(params) + 1} AND c.user_id IS NULL)")
            params.append(guest_id)

        query = """
            SELECT m.role, m.content, m.created_at, c.id AS conversation_id
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
        """
        if where_clauses:
            query += " WHERE " + " AND ".join(where_clauses)

        query += f" ORDER BY m.created_at DESC LIMIT ${len(params) + 1}"
        params.append(limit)

        rows = await conn.fetch(query, *params)
        return [dict(r) for r in reversed(rows)]
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Guest Migration & Preservation Operations
# ---------------------------------------------------------------------------
async def get_guest_migration_overview(
    conn: DbConn,
    guest_id: str,
    user_id: str,
) -> Dict[str, Any]:
    """Retrieve migration statistics: total, unimported, and already imported conversations and memories."""
    has_log_table = await conn.fetchval(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'guest_migration_log')"
    )
    has_guest_col = await conn.fetchval(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'guest_id')"
    )
    if not has_guest_col:
        return {
            "eligible": False,
            "guest_id": guest_id,
            "user_id": user_id,
            "total_conversations": 0,
            "unimported_conversations": 0,
            "already_imported_count": 0,
            "total_memories": 0,
            "unimported_memories": 0,
        }

    total_convs = await conn.fetchval(
        "SELECT COUNT(*) FROM conversations WHERE guest_id = $1 AND user_id IS NULL",
        guest_id
    ) or 0

    already_imported = 0
    if has_log_table and total_convs > 0:
        already_imported = await conn.fetchval(
            """
            SELECT COUNT(*) FROM guest_migration_log gml
            JOIN conversations c ON c.id = gml.guest_conversation_id
            WHERE gml.guest_id = $1 AND gml.user_id = $2
            """,
            guest_id, user_id
        ) or 0

    unimported_convs = max(0, total_convs - already_imported)

    guest_pattern = f"guest_{guest_id}"
    total_mems = await conn.fetchval(
        "SELECT COUNT(*) FROM memory_chunks WHERE user_id = $1 OR user_id = $2",
        guest_id, guest_pattern
    ) or 0

    return {
        "eligible": unimported_convs > 0 or total_mems > 0,
        "has_guest_data": int(total_convs) > 0 or int(total_mems) > 0,
        "guest_conversations_count": int(unimported_convs),
        "guest_id": guest_id,
        "user_id": user_id,
        "total_conversations": int(total_convs),
        "unimported_conversations": int(unimported_convs),
        "already_imported_count": int(already_imported),
        "total_memories": int(total_mems),
        "unimported_memories": int(total_mems),
    }


async def list_guest_conversations_for_migration(
    conn: DbConn,
    guest_id: str,
    user_id: str,
) -> List[Dict[str, Any]]:
    """List all guest conversations with metadata, preview, and already_imported status."""
    has_log_table = await conn.fetchval(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'guest_migration_log')"
    )

    log_join = """
        LEFT JOIN guest_migration_log gml 
        ON gml.guest_conversation_id = c.id AND gml.user_id = $2
    """ if has_log_table else ""

    select_fields = """
        c.id, c.title, c.started_at, c.last_active_at,
        COUNT(m.id) AS message_count,
        (
            SELECT content FROM messages
            WHERE conversation_id = c.id
            ORDER BY created_at DESC, id DESC LIMIT 1
        ) AS last_message_preview
    """
    if has_log_table:
        select_fields += ", (gml.id IS NOT NULL) AS already_imported, gml.imported_at"
    else:
        select_fields += ", FALSE AS already_imported, NULL::timestamptz AS imported_at"

    query = f"""
        SELECT {select_fields}
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        {log_join}
        WHERE c.guest_id = $1 AND c.user_id IS NULL
        GROUP BY c.id, c.title, c.started_at, c.last_active_at
    """
    if has_log_table:
        query += ", gml.id, gml.imported_at"

    query += " ORDER BY c.last_active_at DESC"

    rows = await conn.fetch(query, guest_id, user_id)
    return [
        {
            "id": str(r["id"]),
            "title": r["title"] or "Chat Session",
            "started_at": r["started_at"].isoformat() if hasattr(r["started_at"], "isoformat") else str(r["started_at"]),
            "last_active_at": r["last_active_at"].isoformat() if hasattr(r["last_active_at"], "isoformat") else str(r["last_active_at"]),
            "message_count": int(r["message_count"] or 0),
            "already_imported": bool(r.get("already_imported", False)),
            "imported_at": r["imported_at"].isoformat() if r.get("imported_at") and hasattr(r["imported_at"], "isoformat") else None,
            "preview": (r.get("last_message_preview") or "")[:120],
        }
        for r in rows
    ]


async def migrate_single_conversation(
    conn: DbConn,
    guest_conv_id: Union[str, uuid.UUID],
    guest_id: str,
    user_id: str,
) -> Optional[str]:
    """Clone a single guest conversation to the user account with COPY/LINK->PRESERVE semantics.
    Strictly idempotent: returns existing user_conversation_id if already migrated.
    """
    try:
        cid = uuid.UUID(str(guest_conv_id))
    except (ValueError, TypeError):
        return None

    # 1. Idempotency check: if already migrated, return existing user_conversation_id
    existing = await conn.fetchrow(
        "SELECT user_conversation_id FROM guest_migration_log WHERE guest_conversation_id = $1 AND user_id = $2",
        cid, user_id
    )
    if existing:
        return str(existing["user_conversation_id"])

    # 2. Check ownership
    guest_conv = await conn.fetchrow(
        "SELECT id, title, started_at, last_active_at FROM conversations WHERE id = $1 AND guest_id = $2 AND user_id IS NULL",
        cid, guest_id
    )
    if not guest_conv:
        return None

    # 3. Create clone for authenticated user with imported_from_id reference
    new_cid = uuid.uuid4()
    await conn.execute(
        """
        INSERT INTO conversations (id, title, user_id, guest_id, imported_from_id, started_at, last_active_at)
        VALUES ($1, $2, $3, NULL, $4, $5, $6)
        """,
        new_cid, guest_conv["title"], user_id, cid, guest_conv["started_at"], guest_conv["last_active_at"]
    )

    # 4. Copy all messages
    await conn.execute(
        """
        INSERT INTO messages (conversation_id, role, content, skill_called, created_at)
        SELECT $1, role, content, skill_called, created_at
        FROM messages
        WHERE conversation_id = $2
        ORDER BY created_at ASC, id ASC
        """,
        new_cid, cid
    )

    # 5. Record migration mapping
    await conn.execute(
        """
        INSERT INTO guest_migration_log (guest_id, user_id, guest_conversation_id, user_conversation_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (guest_conversation_id, user_id) DO NOTHING
        """,
        guest_id, user_id, cid, new_cid
    )

    return str(new_cid)


async def migrate_all_guest_conversations(
    conn: DbConn,
    guest_id: str,
    user_id: str,
) -> int:
    """Migrate all unimported conversations belonging to guest_id into user_id."""
    unimported = await conn.fetch(
        """
        SELECT c.id FROM conversations c
        LEFT JOIN guest_migration_log gml 
        ON gml.guest_conversation_id = c.id AND gml.user_id = $2
        WHERE c.guest_id = $1 AND c.user_id IS NULL AND gml.id IS NULL
        """,
        guest_id, user_id
    )

    count = 0
    for row in unimported:
        migrated_id = await migrate_single_conversation(conn, row["id"], guest_id, user_id)
        if migrated_id:
            count += 1
    return count


async def migrate_guest_memories(
    conn: DbConn,
    guest_id: str,
    user_id: str,
) -> int:
    """Clone memory_chunks from guest identity to user account with deduplication.
    Original guest memory chunks are preserved.
    """
    guest_pattern = f"guest_{guest_id}"
    chunks = await conn.fetch(
        """
        SELECT id, domain, project_id, content, embedding, source, tags
        FROM memory_chunks
        WHERE user_id = $1 OR user_id = $2
        ORDER BY id ASC
        """,
        guest_id, guest_pattern
    )

    imported_count = 0
    for ch in chunks:
        exists = await conn.fetchval(
            """
            SELECT id FROM memory_chunks
            WHERE user_id = $1 AND domain = $2 AND LEFT(content, 60) = LEFT($3, 60)
            LIMIT 1
            """,
            user_id, ch["domain"], ch["content"]
        )
        if exists:
            continue

        await conn.execute(
            """
            INSERT INTO memory_chunks (domain, project_id, content, embedding, source, tags, user_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            """,
            ch["domain"], ch["project_id"], ch["content"], ch["embedding"],
            f"imported_from_guest:{ch.get('source') or ''}", ch["tags"], user_id
        )
        imported_count += 1

    return imported_count


async def delete_guest_data(
    conn: DbConn,
    guest_id: str,
) -> Dict[str, int]:
    """Privacy control: permanently delete all guest conversations and memory chunks for a guest."""
    guest_pattern = f"guest_{guest_id}"

    deleted_convs = await conn.fetchval(
        """
        WITH deleted AS (
            DELETE FROM conversations
            WHERE guest_id = $1 AND user_id IS NULL
            RETURNING id
        )
        SELECT COUNT(*) FROM deleted
        """,
        guest_id
    ) or 0

    deleted_mems = await conn.fetchval(
        """
        WITH deleted AS (
            DELETE FROM memory_chunks
            WHERE user_id = $1 OR user_id = $2
            RETURNING id
        )
        SELECT COUNT(*) FROM deleted
        """,
        guest_id, guest_pattern
    ) or 0

    return {
        "deleted_conversations": int(deleted_convs),
        "deleted_memories": int(deleted_mems),
    }


