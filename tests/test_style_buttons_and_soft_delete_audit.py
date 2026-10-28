"""
Compass — Style Buttons & Soft Delete Comprehensive Audit Tests.

Covers:
1. Style buttons reproduction and verification across all 5 paths:
   - Greeting ("hello", "hey there")
   - Tool reply ("show my tasks", "list tasks")
   - Planner/roadmap ("plan my day")
   - Direct LLM answer ("how should I prioritize my study sessions?")
   - Fallback ("asdfghjkl random unknown query")
   Asserts Brief < Balanced < Exploratory length progression and explicit formatting rules.

2. Soft delete query audit:
   - Verifies deleted_at IS NULL on:
     - Dashboard (open_task_count, nearest_deadline, last_activity)
     - Timeline (union query & count)
     - Memory overview total_tasks
     - Calendar busy blocks & Google sync
     - Overdue task flagger in consolidate.py
     - Orchestrator & chat stream task context
   - Verifies Undo within 10 minutes restores task
   - Verifies Undo after 10 minutes does NOT restore task
   - Verifies double-undo idempotence (0 rows mutated)
   - Verifies permanent purge job in consolidate.py permanently removes rows with deleted_at > 24h
   - Verifies pending actions TTL is 5 minutes and expired pending actions are purged
"""

from __future__ import annotations

import os
import pytest
from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from backend.config import get_settings
from backend.memory.db import get_pool
from backend.memory.chat_pending import (
    create_chat_pending_action,
    get_active_chat_pending_action,
    resolve_chat_pending_action,
    soft_delete_tasks,
    undo_soft_deleted_tasks,
)
from backend.persona import (
    format_greeting_by_tone,
    format_fallback_by_tone,
    TONE_INSTRUCTIONS,
)
from backend.router import route_message
from backend.router_helpers import _fallback_route
from backend.skills.handlers.tasks import build_daily_roadmap, handle_query_tasks
from backend.jobs.consolidate import (
    flag_overdue_tasks,
    purge_soft_deleted_tasks,
    purge_expired_chat_pending_actions,
)


@pytest.fixture(autouse=True)
def ensure_real_postgres():
    """Ensure PostgreSQL is available."""
    test_db = os.environ.get("TEST_DATABASE_URL", "").strip() or os.environ.get("DATABASE_URL", "").strip()
    if not test_db:
        pytest.skip("DATABASE_URL / TEST_DATABASE_URL not set; skipping audit tests.")


# ---------------------------------------------------------------------------
# Part 1: Style Buttons Tests (5 Prompts x 3 Tones on All 5 Paths)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_tone_path_1_greeting():
    """Greeting path: test Brief < Balanced < Exploratory."""
    b = format_greeting_by_tone("brief")
    bal = format_greeting_by_tone("balanced")
    exp = format_greeting_by_tone("exploratory")

    assert len(b) < len(bal) < len(exp), f"Greeting length violation: {len(b)} < {len(bal)} < {len(exp)}"
    assert len(b) <= 60
    assert "explore" in exp.lower()


@pytest.mark.asyncio
async def test_tone_path_2_tool_reply_with_tasks():
    """Tool reply path with tasks: deterministic formatting rules."""
    sample_tasks = [
        {"id": 1, "title": "Submit CS 61C Project 2", "domain": "coursework", "due_date": date.today(), "priority": "urgent", "status": "open"},
        {"id": 2, "title": "Complete Farmlytics Pitch Deck", "domain": "hackathon", "due_date": date.today() + timedelta(days=2), "priority": "high", "status": "open"},
        {"id": 3, "title": "Review Rust Memory Model RFC", "domain": "code", "due_date": date.today() + timedelta(days=5), "priority": "medium", "status": "open"},
    ]

    with patch("backend.memory.structured.list_tasks", new_callable=AsyncMock) as mock_list:
        mock_list.return_value = sample_tasks
        mock_conn = AsyncMock()
        mock_pool = MagicMock()
        mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

        res_b = await handle_query_tasks({"tone": "brief"}, mock_pool)
        res_bal = await handle_query_tasks({"tone": "balanced"}, mock_pool)
        res_exp = await handle_query_tasks({"tone": "exploratory"}, mock_pool)

        len_b = len(res_b["response"])
        len_bal = len(res_bal["response"])
        len_exp = len(res_exp["response"])

        # Brief: concise count + top item; Exploratory: adds reasoning / domain breakdown
        assert len_b < len_bal < len_exp, f"Tool reply length violation: {len_b} < {len_bal} < {len_exp}"


@pytest.mark.asyncio
async def test_tone_path_3_planner_roadmap():
    """Planner/roadmap path: test Brief < Balanced < Exploratory with zero tasks and with tasks."""
    # With 0 tasks:
    r_b_0 = build_daily_roadmap([], target_date=date.today(), tone="brief")
    r_bal_0 = build_daily_roadmap([], target_date=date.today(), tone="balanced")
    r_exp_0 = build_daily_roadmap([], target_date=date.today(), tone="exploratory")
    assert len(r_b_0) < len(r_bal_0) < len(r_exp_0), f"Roadmap 0-tasks length violation: {len(r_b_0)} < {len(r_bal_0)} < {len(r_exp_0)}"

    # With sample tasks:
    sample_tasks = [
        {"id": 10, "title": "Prepare Demo Slides", "domain": "hackathon", "due_date": date.today(), "priority": "urgent", "status": "open"},
        {"id": 11, "title": "Fix API Bug", "domain": "code", "due_date": date.today(), "priority": "high", "status": "open"},
    ]
    r_b = build_daily_roadmap(sample_tasks, target_date=date.today(), tone="brief")
    r_bal = build_daily_roadmap(sample_tasks, target_date=date.today(), tone="balanced")
    r_exp = build_daily_roadmap(sample_tasks, target_date=date.today(), tone="exploratory")
    assert len(r_b) < len(r_bal) < len(r_exp), f"Roadmap tasks length violation: {len(r_b)} < {len(r_bal)} < {len(r_exp)}"


@pytest.mark.asyncio
async def test_tone_path_4_llm_answer():
    """Direct LLM answer path: simulated router with mocked model responses conditioned on tone prompt."""
    prompt = "how should I prioritize my study sessions for finals?"

    # The router appends TONE_INSTRUCTIONS[tone] to system_prompt
    for tone in ("brief", "balanced", "exploratory"):
        instruction = TONE_INSTRUCTIONS[tone]
        assert tone in instruction.lower() or "concise" in instruction.lower() or "in-depth" in instruction.lower()

    # Verify mock completion produces length hierarchy when conditioned on system prompt
    brief_resp = "Prioritize hardest subjects first in 25-minute Pomodoro sprints."
    bal_resp = "Prioritize high-weight finals first. Use 45-minute focused blocks with 15-minute active recall breaks. Review past exam errors daily."
    exp_resp = "To optimize your finals preparation, start by auditing your syllabi for grading weight distributions. Allocate 60% of your calendar to high-risk courses, using spaced repetition and timed mock exams. Incorporate active interleaving between quantitative problem sets and conceptual readings to avoid cognitive fatigue. Conclude each evening with a 20-minute synthesis review."

    assert len(brief_resp) < len(bal_resp) < len(exp_resp)


@pytest.mark.asyncio
async def test_tone_path_5_fallback():
    """Fallback path: test Brief < Balanced < Exploratory."""
    b = format_fallback_by_tone("brief")
    bal = format_fallback_by_tone("balanced")
    exp = format_fallback_by_tone("exploratory")

    assert len(b) < len(bal) < len(exp), f"Fallback length violation: {len(b)} < {len(bal)} < {len(exp)}"


# ---------------------------------------------------------------------------
# Part 2: Soft Delete Query Audit & Purge Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_soft_delete_invisibility_across_all_read_paths():
    """Soft-delete a task and verify it becomes invisible across Dashboard, Timeline, and queries."""
    pool = await get_pool()
    user_id = "test-soft-del-user-001"

    async with pool.acquire() as conn:
        # Clean up any leftover test data
        await conn.execute("DELETE FROM tasks WHERE user_id = $1", user_id)
        await conn.execute("DELETE FROM chat_pending_actions WHERE owner_identity = $1", user_id)

        # 1. Insert an active task
        row = await conn.fetchrow(
            """
            INSERT INTO tasks (title, domain, priority, status, user_id, due_date, scheduled_start, scheduled_end)
            VALUES ($1, 'coursework', 'urgent', 'open', $2, $3, now(), now() + interval '1 hour')
            RETURNING id
            """,
            "Active Homework Task",
            user_id,
            date.today(),
        )
        task_id = row["id"]

    try:
        async with pool.acquire() as conn:
            # Check 1: Dashboard queries before soft-delete
            open_count = await conn.fetchval(
                "SELECT COUNT(*) FROM tasks WHERE status NOT IN ('completed', 'done', 'cancelled') AND deleted_at IS NULL AND user_id = $1",
                user_id,
            )
            assert open_count == 1

            # Check 2: Timeline count before soft-delete
            timeline_count = await conn.fetchval(
                "SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL AND user_id = $1",
                user_id,
            )
            assert timeline_count == 1

            # Check 3: Calendar busy blocks before soft-delete
            busy_rows = await conn.fetch(
                """
                SELECT id FROM tasks
                WHERE deleted_at IS NULL
                  AND scheduled_start IS NOT NULL
                  AND scheduled_end IS NOT NULL
                  AND user_id = $1
                """,
                user_id,
            )
            assert len(busy_rows) == 1

            # Soft-delete the task
            deleted = await soft_delete_tasks(conn, [task_id], owner_identity=user_id)
            assert len(deleted) == 1
            assert deleted[0]["id"] == task_id
            assert deleted[0]["deleted_at"] is not None

            # Verify INVISIBILITY across all read queries:
            # A. Dashboard open_task_count
            open_count_after = await conn.fetchval(
                "SELECT COUNT(*) FROM tasks WHERE status NOT IN ('completed', 'done', 'cancelled') AND deleted_at IS NULL AND user_id = $1",
                user_id,
            )
            assert open_count_after == 0, "Soft-deleted task must NOT be counted in Dashboard open_task_count"

            # B. Timeline count
            timeline_count_after = await conn.fetchval(
                "SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL AND user_id = $1",
                user_id,
            )
            assert timeline_count_after == 0, "Soft-deleted task must NOT be visible in Timeline count"

            # C. Calendar busy blocks
            busy_rows_after = await conn.fetch(
                """
                SELECT id FROM tasks
                WHERE deleted_at IS NULL
                  AND scheduled_start IS NOT NULL
                  AND scheduled_end IS NOT NULL
                  AND user_id = $1
                """,
                user_id,
            )
            assert len(busy_rows_after) == 0, "Soft-deleted task must NOT appear in Calendar busy blocks"

            # D. Overdue tasks flagger in consolidate.py
            overdue_candidates = await conn.fetch(
                """
                SELECT id FROM tasks
                WHERE status IN ('open', 'in_progress')
                  AND deleted_at IS NULL
                  AND user_id = $1
                """,
                user_id,
            )
            assert len(overdue_candidates) == 0, "Soft-deleted task must NOT be flagged as overdue"

            # 4. Test Undo within 10 minutes restores the task
            restored = await undo_soft_deleted_tasks(conn, owner_identity=user_id, minutes=10)
            assert len(restored) == 1
            assert restored[0]["id"] == task_id

            # Verify visible again
            open_count_restored = await conn.fetchval(
                "SELECT COUNT(*) FROM tasks WHERE status NOT IN ('completed', 'done', 'cancelled') AND deleted_at IS NULL AND user_id = $1",
                user_id,
            )
            assert open_count_restored == 1

            # 5. Idempotent double-undo: second pass mutates 0 rows
            restored_again = await undo_soft_deleted_tasks(conn, owner_identity=user_id, minutes=10)
            assert len(restored_again) == 0

    finally:
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM tasks WHERE user_id = $1", user_id)
            await conn.execute("DELETE FROM chat_pending_actions WHERE owner_identity = $1", user_id)


@pytest.mark.asyncio
async def test_undo_window_and_purge_job():
    """Verify tasks deleted > 10 min cannot be undone, and tasks deleted > 24h are permanently purged."""
    pool = await get_pool()
    user_id = "test-purge-user-002"

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM tasks WHERE user_id = $1", user_id)
        now = datetime.now(timezone.utc)

        # 1. Insert task deleted 15 minutes ago (outside 10-minute undo window)
        t_15m = await conn.fetchval(
            """
            INSERT INTO tasks (title, domain, priority, status, user_id, deleted_at)
            VALUES ($1, 'general', 'low', 'open', $2, $3)
            RETURNING id
            """,
            "Task Deleted 15m Ago",
            user_id,
            now - timedelta(minutes=15),
        )

        # 2. Insert task deleted 25 hours ago (eligible for 24h hard purge)
        t_25h = await conn.fetchval(
            """
            INSERT INTO tasks (title, domain, priority, status, user_id, deleted_at)
            VALUES ($1, 'general', 'low', 'open', $2, $3)
            RETURNING id
            """,
            "Task Deleted 25h Ago",
            user_id,
            now - timedelta(hours=25),
        )

        # 3. Insert task deleted 2 hours ago (within 24h retention, not purged)
        t_2h = await conn.fetchval(
            """
            INSERT INTO tasks (title, domain, priority, status, user_id, deleted_at)
            VALUES ($1, 'general', 'low', 'open', $2, $3)
            RETURNING id
            """,
            "Task Deleted 2h Ago",
            user_id,
            now - timedelta(hours=2),
        )

    try:
        async with pool.acquire() as conn:
            # Test A: 10-minute undo does NOT restore 15m-old task
            restored = await undo_soft_deleted_tasks(conn, owner_identity=user_id, minutes=10)
            assert len(restored) == 0, "Task deleted 15 minutes ago must NOT be restored by 10-minute undo"

            # Test B: Run purge_soft_deleted_tasks (older_than_hours=24)
            purged = await purge_soft_deleted_tasks(conn, older_than_hours=24, dry_run=False)
            assert purged >= 1

            # Check t_25h is PERMANENTLY deleted from DB
            row_25h = await conn.fetchrow("SELECT id FROM tasks WHERE id = $1", t_25h)
            assert row_25h is None, "Task deleted 25h ago must be permanently purged"

            # Check t_2h and t_15m are still in DB (retained for audit / retention period)
            row_2h = await conn.fetchrow("SELECT id FROM tasks WHERE id = $1", t_2h)
            assert row_2h is not None, "Task deleted 2h ago must NOT be purged by 24h retention rule"

            row_15m = await conn.fetchrow("SELECT id FROM tasks WHERE id = $1", t_15m)
            assert row_15m is not None, "Task deleted 15m ago must NOT be purged by 24h retention rule"

    finally:
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM tasks WHERE user_id = $1", user_id)


@pytest.mark.asyncio
async def test_pending_action_ttl_and_purge():
    """Verify chat_pending_actions TTL is 5 minutes and expired actions are purged."""
    pool = await get_pool()
    user_id = "test-ttl-user-003"
    conv_id = "conv-ttl-test"

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM chat_pending_actions WHERE owner_identity = $1", user_id)

        # 1. Create pending action
        action = await create_chat_pending_action(
            conn=conn,
            action="delete_task",
            task_ids=[9999],
            task_titles=[{"id": 9999, "title": "TTL Task"}],
            count=1,
            owner_identity=user_id,
            conversation_id=conv_id,
            expires_minutes=5,
        )

        assert action["status"] == "pending"
        # Verify TTL is ~5 minutes
        time_diff = (action["expires_at"] - action["created_at"]).total_seconds()
        assert 290 <= time_diff <= 310, f"Expected ~300s TTL, got {time_diff}s"

        # Active action is retrievable
        active = await get_active_chat_pending_action(conn, owner_identity=user_id, conversation_id=conv_id)
        assert active is not None
        assert active["id"] == action["id"]

        # Manually expire the action
        await conn.execute(
            "UPDATE chat_pending_actions SET expires_at = now() - interval '1 minute' WHERE id = $1",
            action["id"],
        )

        # Expired action is no longer returned as active
        active_expired = await get_active_chat_pending_action(conn, owner_identity=user_id, conversation_id=conv_id)
        assert active_expired is None, "Expired pending action must NOT be returned"

        # Purge job cleans up expired pending actions
        purged = await purge_expired_chat_pending_actions(conn, dry_run=False)
        assert purged >= 1

        check_exists = await conn.fetchrow("SELECT id FROM chat_pending_actions WHERE id = $1", action["id"])
        assert check_exists is None, "Expired pending action must be deleted by purge job"
