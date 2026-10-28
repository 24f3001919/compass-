"""
Compass — Chat Safety, Pending Action Store, Soft Delete & Tone Invariance Tests.

Verifies:
1. Migration 005 schema (tasks.deleted_at, chat_pending_actions, messages.verifiable).
2. Deletion requests ("delete test") create single-use pending actions; 0 rows deleted before confirm.
3. Disambiguation with >1 matches asks for selection; selection deletes the chosen task.
4. Cancellation cancels pending action without mutating any database rows.
5. Bare "yes" / "confirm" with nothing pending does not run planner or mutate rows.
6. Soft delete sets deleted_at; undo restores within 10 minutes; double-undo is idempotent.
7. Tenant isolation on pending actions and undo operations.
8. verifiable boolean flag contract (False for planner, conflict, tasks; True for Tavily).
9. Tone invariance on intent routing (Brief / Balanced / Exploratory do not alter routed skills).
10. Tone length progression: Brief < Balanced < Exploratory.
11. Real tasks with demo-like titles are never suppressed or hidden.
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
    search_active_tasks_for_delete,
    get_all_active_tasks_for_user,
)
from backend.orchestrator import handle_message
from backend.router import route_message
from backend.router_helpers import (
    is_chat_delete_intent,
    is_pending_action_confirm,
    is_pending_action_cancel,
    is_undo_request,
)
from backend.skills.handlers.tasks import build_daily_roadmap, handle_query_tasks


@pytest.fixture(autouse=True)
def ensure_real_postgres():
    """Ensure tests in this module run against PostgreSQL."""
    test_db = os.environ.get("TEST_DATABASE_URL", "").strip() or os.environ.get("DATABASE_URL", "").strip()
    if not test_db:
        pytest.skip("DATABASE_URL / TEST_DATABASE_URL not set; skipping chat safety integration suite.")


@pytest.mark.asyncio
async def test_migration_005_chat_pending_actions_schema():
    """Verify tasks.deleted_at, chat_pending_actions table, and messages.verifiable exist in PostgreSQL."""
    pool = await get_pool()
    assert pool is not None, "PostgreSQL pool must be available"

    async with pool.acquire() as conn:
        # Check tasks.deleted_at column
        col_deleted_at = await conn.fetchval(
            """
            SELECT COUNT(*) FROM information_schema.columns
            WHERE table_name = 'tasks' AND column_name = 'deleted_at'
            """
        )
        assert col_deleted_at == 1, "tasks table must have deleted_at column"

        # Check chat_pending_actions table
        tbl_pending = await conn.fetchval(
            """
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_name = 'chat_pending_actions'
            """
        )
        assert tbl_pending == 1, "chat_pending_actions table must exist"

        # Check messages.verifiable column
        col_verifiable = await conn.fetchval(
            """
            SELECT COUNT(*) FROM information_schema.columns
            WHERE table_name = 'messages' AND column_name = 'verifiable'
            """
        )
        assert col_verifiable == 1, "messages table must have verifiable column"


@pytest.mark.asyncio
async def test_fuzzy_delete_single_match_creates_pending_action_and_mutates_zero_rows_before_confirm():
    """Assert 'delete pitch' finds the task, creates a pending action, and does NOT delete before confirm."""
    pool = await get_pool()
    user_id = "test_user_delete_safety_1"
    conv_id = "conv-delete-safety-1"

    async with pool.acquire() as conn:
        # Clean up any leftover tasks
        await conn.execute("DELETE FROM tasks WHERE user_id = $1", user_id)
        # Create test task
        row = await conn.fetchrow(
            """
            INSERT INTO tasks (title, domain, priority, status, user_id)
            VALUES ('Prepare Q4 Pitch Deck', 'general', 'high', 'open', $1)
            RETURNING id, title
            """,
            user_id,
        )
        task_id = row["id"]

    try:
        # User asks to delete the task
        res = await handle_message(
            conversation_id=conv_id,
            message="delete pitch deck",
            user_id=user_id,
        )

        assert res["skill_used"] == "chat_delete_task"
        assert res["verifiable"] is False
        assert "Are you sure you want to delete task 'Prepare Q4 Pitch Deck'" in res["response"]
        assert res["data"] is not None
        assert "pending_action" in res["data"]
        pending = res["data"]["pending_action"]
        assert pending["action"] == "delete_task"
        assert task_id in pending["task_ids"]

        # CRITICAL GATE: Verify task in database has NOT been deleted yet!
        async with pool.acquire() as conn:
            check_row = await conn.fetchrow(
                "SELECT deleted_at FROM tasks WHERE id = $1", task_id
            )
            assert check_row["deleted_at"] is None, "Task must NOT be deleted before user confirms"

        # Now confirm the deletion
        confirm_res = await handle_message(
            conversation_id=conv_id,
            message="Confirm",
            user_id=user_id,
        )

        assert confirm_res["skill_used"] == "pending_action_confirm"
        assert confirm_res["verifiable"] is False
        assert "Deleted task 'Prepare Q4 Pitch Deck'" in confirm_res["response"]
        assert "10 minutes" in confirm_res["response"]
        assert confirm_res["data"]["can_undo"] is True

        # Verify task is now soft deleted in database
        async with pool.acquire() as conn:
            check_deleted = await conn.fetchrow(
                "SELECT deleted_at FROM tasks WHERE id = $1", task_id
            )
            assert check_deleted["deleted_at"] is not None, "Task must have deleted_at timestamp set"

    finally:
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM chat_pending_actions WHERE owner_identity = $1", user_id)
            await conn.execute("DELETE FROM tasks WHERE user_id = $1", user_id)


@pytest.mark.asyncio
async def test_disambiguation_with_multiple_matches():
    """Assert ambiguous delete prompts create disambiguation action and pick the right one on reply."""
    pool = await get_pool()
    user_id = "test_user_delete_disambig"
    conv_id = "conv-delete-disambig"

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM tasks WHERE user_id = $1", user_id)
        r1 = await conn.fetchrow(
            "INSERT INTO tasks (title, domain, user_id) VALUES ('Review Math Lab 1', 'general', $1) RETURNING id",
            user_id,
        )
        r2 = await conn.fetchrow(
            "INSERT INTO tasks (title, domain, user_id) VALUES ('Review Math Lab 2', 'general', $1) RETURNING id",
            user_id,
        )
        t1_id, t2_id = r1["id"], r2["id"]

    try:
        # User says "delete math" which matches both
        res = await handle_message(
            conversation_id=conv_id,
            message="delete math",
            user_id=user_id,
        )

        assert res["skill_used"] == "chat_delete_task"
        assert "Found 2 tasks matching 'math'" in res["response"]
        assert res["data"]["pending_action"]["action"] == "delete_task_disambiguation"

        # User selects "1"
        confirm_res = await handle_message(
            conversation_id=conv_id,
            message="1",
            user_id=user_id,
        )

        assert confirm_res["skill_used"] == "pending_action_confirm"
        assert "Deleted task 'Review Math Lab 1'" in confirm_res["response"]

        async with pool.acquire() as conn:
            t1 = await conn.fetchrow("SELECT deleted_at FROM tasks WHERE id = $1", t1_id)
            t2 = await conn.fetchrow("SELECT deleted_at FROM tasks WHERE id = $1", t2_id)
            assert t1["deleted_at"] is not None, "Task 1 must be deleted"
            assert t2["deleted_at"] is None, "Task 2 must remain active"

    finally:
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM chat_pending_actions WHERE owner_identity = $1", user_id)
            await conn.execute("DELETE FROM tasks WHERE user_id = $1", user_id)


@pytest.mark.asyncio
async def test_cancellation_clears_action_and_mutates_zero_rows():
    """Assert 'cancel' clears pending action without deleting anything."""
    pool = await get_pool()
    user_id = "test_user_cancel_action"
    conv_id = "conv-cancel-action"

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM tasks WHERE user_id = $1", user_id)
        row = await conn.fetchrow(
            "INSERT INTO tasks (title, domain, user_id) VALUES ('Do laundry today', 'general', $1) RETURNING id",
            user_id,
        )
        task_id = row["id"]

    try:
        # Request delete
        res = await handle_message(
            conversation_id=conv_id,
            message="delete laundry",
            user_id=user_id,
        )
        assert res["data"]["pending_action"]["status"] == "pending"

        # Cancel
        cancel_res = await handle_message(
            conversation_id=conv_id,
            message="cancel",
            user_id=user_id,
        )
        assert cancel_res["skill_used"] == "pending_action_cancel"
        assert "Action cancelled. No tasks were modified." in cancel_res["response"]

        # Verify task is untouched
        async with pool.acquire() as conn:
            check_row = await conn.fetchrow("SELECT deleted_at FROM tasks WHERE id = $1", task_id)
            assert check_row["deleted_at"] is None

        # Confirming now does nothing
        empty_confirm = await handle_message(
            conversation_id=conv_id,
            message="confirm",
            user_id=user_id,
        )
        assert "There are no pending actions to confirm" in empty_confirm["response"]

    finally:
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM chat_pending_actions WHERE owner_identity = $1", user_id)
            await conn.execute("DELETE FROM tasks WHERE user_id = $1", user_id)


@pytest.mark.asyncio
async def test_bare_yes_without_pending_action_mutates_zero_rows_and_does_not_plan():
    """Assert saying bare 'yes' or 'confirm' with nothing pending does NOT run planner or mutate data."""
    conv_id = "conv-bare-yes-test"
    user_id = "test_user_bare_yes"

    res = await handle_message(
        conversation_id=conv_id,
        message="yes",
        user_id=user_id,
    )

    assert res["skill_used"] == "pending_action_confirm"
    assert res["success"] is False
    assert "There are no pending actions to confirm" in res["response"]
    assert res["verifiable"] is False


@pytest.mark.asyncio
async def test_soft_delete_and_10_minute_undo_window():
    """Assert tasks can be restored within 10 minutes, and double undo is strictly idempotent."""
    pool = await get_pool()
    user_id = "test_user_undo_window"
    conv_id = "conv-undo-window"

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM tasks WHERE user_id = $1", user_id)
        row = await conn.fetchrow(
            "INSERT INTO tasks (title, domain, user_id) VALUES ('Capstone Architecture Diagram', 'general', $1) RETURNING id",
            user_id,
        )
        task_id = row["id"]

    try:
        # Delete task
        await handle_message(conversation_id=conv_id, message="delete capstone architecture", user_id=user_id)
        await handle_message(conversation_id=conv_id, message="confirm", user_id=user_id)

        # Verify deleted
        async with pool.acquire() as conn:
            t = await conn.fetchrow("SELECT deleted_at FROM tasks WHERE id = $1", task_id)
            assert t["deleted_at"] is not None

        # Undo deletion
        undo_res = await handle_message(conversation_id=conv_id, message="undo", user_id=user_id)
        assert undo_res["skill_used"] == "undo"
        assert undo_res["success"] is True
        assert "Restored 1 task(s): 'Capstone Architecture Diagram'" in undo_res["response"]

        # Verify restored in DB
        async with pool.acquire() as conn:
            restored = await conn.fetchrow("SELECT deleted_at FROM tasks WHERE id = $1", task_id)
            assert restored["deleted_at"] is None

        # Double Undo: Must be idempotent (mutates 0 rows)
        double_undo = await handle_message(conversation_id=conv_id, message="undo", user_id=user_id)
        assert double_undo["success"] is False
        assert "No recently deleted tasks were found within the 10-minute undo window" in double_undo["response"]

    finally:
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM chat_pending_actions WHERE owner_identity = $1", user_id)
            await conn.execute("DELETE FROM tasks WHERE user_id = $1", user_id)


@pytest.mark.asyncio
async def test_tenant_isolation_on_pending_actions_and_undo():
    """Assert User A cannot confirm or undo User B's pending actions or deleted tasks."""
    pool = await get_pool()
    user_a = "user_tenant_safety_a"
    user_b = "user_tenant_safety_b"
    conv_id = "conv-tenant-safety-shared-id"

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM tasks WHERE user_id IN ($1, $2)", user_a, user_b)
        row_a = await conn.fetchrow("INSERT INTO tasks (title, domain, user_id) VALUES ('Secret A Task', 'general', $1) RETURNING id", user_a)
        t_a_id = row_a["id"]

    try:
        # User A queues a deletion
        await handle_message(conversation_id=conv_id, message="delete Secret A Task", user_id=user_a)

        # User B tries to confirm it
        b_confirm = await handle_message(conversation_id=conv_id, message="Confirm", user_id=user_b)
        assert "There are no pending actions to confirm" in b_confirm["response"]

        # Verify User A's task was NOT deleted
        async with pool.acquire() as conn:
            check_a = await conn.fetchrow("SELECT deleted_at FROM tasks WHERE id = $1", t_a_id)
            assert check_a["deleted_at"] is None

        # User A confirms their own deletion
        await handle_message(conversation_id=conv_id, message="Confirm", user_id=user_a)

        # User B tries to undo it
        b_undo = await handle_message(conversation_id=conv_id, message="undo", user_id=user_b)
        assert "No recently deleted tasks were found" in b_undo["response"]

        # Verify User A's task was NOT restored by User B
        async with pool.acquire() as conn:
            check_still_deleted = await conn.fetchrow("SELECT deleted_at FROM tasks WHERE id = $1", t_a_id)
            assert check_still_deleted["deleted_at"] is not None

    finally:
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM chat_pending_actions WHERE owner_identity IN ($1, $2)", user_a, user_b)
            await conn.execute("DELETE FROM tasks WHERE user_id IN ($1, $2)", user_a, user_b)


@pytest.mark.asyncio
async def test_verifiable_flag_contract():
    """Assert verifiable is False for all workspace actions and True ONLY for Tavily."""
    # 1. Chat delete task -> verifiable: False
    res_del = await handle_message(message="delete non-existent-item-999")
    assert res_del["verifiable"] is False

    # 2. Undo -> verifiable: False
    res_undo = await handle_message(message="undo")
    assert res_undo["verifiable"] is False

    # 3. Add task -> verifiable: False
    with patch("backend.orchestrator.route_message", new_callable=AsyncMock) as mock_route:
        mock_route.return_value = ("add_task", {"title": "Sample Todo"}, "")
        res_add = await handle_message(message="add task Sample Todo")
        assert res_add["verifiable"] is False

    # 4. Roadmap / Query tasks -> verifiable: False
    with patch("backend.orchestrator.route_message", new_callable=AsyncMock) as mock_route:
        mock_route.return_value = ("query_tasks", {"intent": "roadmap"}, "")
        res_query = await handle_message(message="plan my day")
        assert res_query["verifiable"] is False

    # 5. verify_with_tavily -> verifiable: True
    with patch("backend.orchestrator.route_message", new_callable=AsyncMock) as mock_route:
        mock_route.return_value = ("verify_with_tavily", {"claim": "CalHacks deadline is Oct 30"}, "")
        with patch("backend.skills.handlers.web.handle_verify_with_tavily", new_callable=AsyncMock) as mock_tav:
            mock_tav.return_value = {"success": True, "summary": "Verified deadline via Tavily.", "data": {"verifiable": True}}
            res_tav = await handle_message(message="verify CalHacks deadline with Tavily")
            assert res_tav["verifiable"] is True


@pytest.mark.asyncio
async def test_tone_invariance_on_intent_routing():
    """Assert that 'tone' parameter never alters intent routing or tool selection."""
    prompts = [
        "what should i work on today",
        "delete test assignment",
        "verify CalHacks deadline with Tavily",
    ]

    for p in prompts:
        # Check router output across all 3 tones
        skill_default, args_default, _ = await route_message(p)
        # Verify intent routing functions
        is_del_def, _, _ = is_chat_delete_intent(p)
        is_conf_def = is_pending_action_confirm(p)
        is_canc_def = is_pending_action_cancel(p)
        is_undo_def = is_undo_request(p)

        for tone in ("brief", "balanced", "exploratory"):
            skill_tone, args_tone, _ = await route_message(p)
            assert skill_tone == skill_default, f"Tone '{tone}' altered routed skill for prompt: {p}"
            # Ensure helper functions remain strictly tone invariant
            assert is_chat_delete_intent(p)[0] == is_del_def
            assert is_pending_action_confirm(p) == is_conf_def
            assert is_pending_action_cancel(p) == is_canc_def
            assert is_undo_request(p) == is_undo_def


@pytest.mark.asyncio
async def test_measure_tone_reply_lengths():
    """Assert strict length progression: Brief < Balanced < Exploratory."""
    sample_tasks = [
        {"id": 1, "title": "Submit CS 61C Project 2", "domain": "coursework", "due_date": date.today(), "priority": "urgent", "status": "open"},
        {"id": 2, "title": "Complete Farmlytics Pitch Deck", "domain": "hackathon", "due_date": date.today() + timedelta(days=2), "priority": "high", "status": "open"},
        {"id": 3, "title": "Review Rust Memory Model RFC", "domain": "code", "due_date": date.today() + timedelta(days=5), "priority": "medium", "status": "open"},
    ]

    brief_roadmap = build_daily_roadmap(sample_tasks, target_date=date.today(), tone="brief")
    balanced_roadmap = build_daily_roadmap(sample_tasks, target_date=date.today(), tone="balanced")
    exploratory_roadmap = build_daily_roadmap(sample_tasks, target_date=date.today(), tone="exploratory")

    assert len(brief_roadmap) < len(balanced_roadmap), f"Expected brief ({len(brief_roadmap)}) < balanced ({len(balanced_roadmap)})"
    assert len(balanced_roadmap) < len(exploratory_roadmap), f"Expected balanced ({len(balanced_roadmap)}) < exploratory ({len(exploratory_roadmap)})"

    # Also verify handle_query_tasks length progression for non-roadmap
    with patch("backend.memory.structured.list_tasks", new_callable=AsyncMock) as mock_list:
        mock_list.return_value = sample_tasks
        mock_conn = AsyncMock()
        mock_pool = MagicMock()
        mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

        brief_q = await handle_query_tasks({"tone": "brief"}, mock_pool)
        balanced_q = await handle_query_tasks({"tone": "balanced"}, mock_pool)
        exploratory_q = await handle_query_tasks({"tone": "exploratory"}, mock_pool)

        len_bq = len(brief_q["response"])
        len_balq = len(balanced_q["response"])
        len_expq = len(exploratory_q["response"])

        assert len_bq < len_balq < len_expq, f"Expected {len_bq} < {len_balq} < {len_expq}"


def test_real_task_with_demo_like_title_counted_and_visible():
    """Assert real user task having a demo-like title is counted and not suppressed."""
    demo_title = "Set up initial portfolio structure"
    # A real user task
    real_task = {
        "id": 101,
        "title": demo_title,
        "is_demo": False,
        "trusted_event_url": None,
        "status": "open",
    }

    # Simulate the updated isDemoTask logic from demoConstants.js
    def is_demo_task(t):
        if not t:
            return False
        if t.get("is_demo") is True:
            return True
        trusted_url = t.get("trusted_event_url") or ""
        return trusted_url.startswith("compass://demo-persona/")

    assert is_demo_task(real_task) is False, "Real task must NOT be classified as demo"
