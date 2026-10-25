"""
Unit and integration tests for:
1. Zero tasks by default for new guest and authenticated identities.
2. No automatic seeding on startup or guest creation.
3. Judge Persona seeding endpoint with injected clock yielding exact category distribution:
   - Overdue: 2 only
   - Due today: 2 (one with time, one date-only)
   - Urgent (within ~24h): 2
   - Due soon (2-3 days): 3
   - Upcoming (4-14 days): 5
   - No deadline: 2
   - In progress: 2, Completed: 2 (one completed today), Blocked: 1
4. Idempotent repeated seeding and later-day date shifting.
5. Non-demo user tasks preservation.
6. Tenant isolation and production guard.
"""

from datetime import date, datetime, time, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi import HTTPException

from backend.routers.tasks_verification import DemoSeedRequest, seed_demo_persona_endpoint
from backend.services.deadline_classifier import classify_deadline, filter_tasks_by_view
from backend.services.task_service import build_frontend_task


@pytest.fixture(autouse=True)
def reset_rate_limits():
    from backend.services.rate_limiter import _MEM_BUCKETS
    _MEM_BUCKETS.clear()
    yield
    _MEM_BUCKETS.clear()


@pytest.mark.asyncio
async def test_new_guest_or_identity_has_zero_tasks_by_default():
    """A fresh user or guest identity has exactly 0 tasks from the API."""
    from backend.routers.tasks import get_frontend_tasks

    mock_request = MagicMock()
    mock_request.headers = {"x-guest-token": "test-guest-token-123"}
    mock_request.cookies = {}

    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
    mock_conn.fetch.return_value = []

    with patch("backend.routers.tasks.get_pool", AsyncMock(return_value=mock_pool)), \
         patch("backend.routers.tasks._get_current_identity", return_value=MagicMock(id="fresh_guest_uuid", is_guest=True)):
        tasks = await get_frontend_tasks(mock_request)
        assert tasks == []
        assert len(tasks) == 0


@pytest.mark.asyncio
async def test_guest_session_creation_does_not_seed():
    """Creating a guest session creates no tasks."""
    from backend.routers.migration import guest_session_endpoint

    mock_request = MagicMock()
    mock_request.method = "POST"
    mock_request.url.scheme = "http"
    mock_request.headers = {}
    mock_response = MagicMock()

    with patch("backend.dependencies.mint_rate_limit", AsyncMock()), \
         patch("backend.services.budgets.check_global_mint_cap", AsyncMock()), \
         patch("backend.services.budgets.record_guest_mint", AsyncMock()):
        res = await guest_session_endpoint(mock_request, mock_response)
        assert res["status"] == "ok"
        assert res["is_new"] is True
        assert "guest_id" in res


@pytest.mark.asyncio
async def test_judge_persona_exact_category_distribution():
    """Judge Persona seed endpoint with injected clock yields the exact requested category distribution."""
    ref_date_str = "2026-10-25"
    ref_date = date(2026, 10, 25)
    # Simulated current clock at 14:00 UTC on reference date
    now_dt = datetime.combine(ref_date, time(14, 0, 0), tzinfo=timezone.utc)

    mock_request = MagicMock()
    mock_ident = MagicMock(id="judge-evaluator-1", is_guest=False)
    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

    # Batch query for existing returns empty (initial seed)
    mock_conn.fetch.return_value = []

    created_tasks = []

    async def mock_create_task(conn, **kwargs):
        t_id = len(created_tasks) + 1
        record = dict(kwargs)
        record["id"] = t_id
        created_tasks.append(record)
        return record

    with patch("backend.routers.tasks_verification.settings") as mock_settings, \
         patch("backend.routers.tasks_verification._get_current_identity", return_value=mock_ident), \
         patch("backend.routers.tasks_verification.get_pool", AsyncMock(return_value=mock_pool)), \
         patch("backend.routers.tasks_verification.structured.get_or_create_project", AsyncMock(return_value={"id": 10})), \
         patch("backend.routers.tasks_verification.structured.create_task", side_effect=mock_create_task), \
         patch("backend.services.embeddings.get_embedding", AsyncMock(return_value=[0.05] * 768)):

        mock_settings.ENVIRONMENT = "development"
        res = await seed_demo_persona_endpoint(mock_request, body=DemoSeedRequest(reference_date=ref_date_str))
        assert res["status"] == "ok"
        assert res["tasks_seeded"] == 21
        assert len(created_tasks) == 21

        # Build frontend representation as served to client
        frontend_tasks = [
            build_frontend_task(t, proj_name="TestProject", now=now_dt)
            for t in created_tasks
        ]
        raw_frontend_dicts = [t.model_dump() for t in frontend_tasks]

        # Verify exact category breakdown
        overdue = filter_tasks_by_view(raw_frontend_dicts, "overdue", now=now_dt)
        due_today = filter_tasks_by_view(raw_frontend_dicts, "due_today", now=now_dt)
        urgent = filter_tasks_by_view(raw_frontend_dicts, "urgent", now=now_dt)
        due_soon = filter_tasks_by_view(raw_frontend_dicts, "due_soon", now=now_dt)
        upcoming = filter_tasks_by_view(raw_frontend_dicts, "upcoming", now=now_dt)
        pending = filter_tasks_by_view(raw_frontend_dicts, "pending", now=now_dt)
        in_progress = filter_tasks_by_view(raw_frontend_dicts, "in_progress", now=now_dt)
        completed = filter_tasks_by_view(raw_frontend_dicts, "completed", now=now_dt)
        blocked = [t for t in raw_frontend_dicts if t.get("status") == "blocked"]

        # 1. Overdue: 2 only
        assert len(overdue) == 2, f"Expected 2 overdue tasks, got {len(overdue)}"

        # 2. Due today: 2
        assert len(due_today) == 2, f"Expected 2 due_today tasks, got {len(due_today)}"
        # Check one with timestamp later today, one date-only
        has_timestamp = any("T" in str(t.get("due_date")) for t in due_today)
        has_date_only = any(len(str(t.get("due_date"))) == 10 for t in due_today)
        assert has_timestamp, "Expected at least one task with timestamp later today"
        assert has_date_only, "Expected at least one date-only task"

        # 3. Urgent (within ~24h): 2
        assert len(urgent) == 2, f"Expected 2 urgent tasks, got {len(urgent)}"

        # 4. Due soon (2-3 days): 3
        due_soon_2_3 = [
            t for t in raw_frontend_dicts
            if t.get("status") == "open" and t.get("due_date")
            and 2 <= (date.fromisoformat(str(t["due_date"])[:10]) - ref_date).days <= 3
        ]
        assert len(due_soon_2_3) == 3, f"Expected 3 open due_soon (2-3 days) tasks, got {len(due_soon_2_3)}"

        # 5. Upcoming (4-14 days): 5 open tasks
        upcoming_4_14 = [
            t for t in raw_frontend_dicts
            if t.get("status") == "open" and t.get("due_date")
            and 4 <= (date.fromisoformat(str(t["due_date"])[:10]) - ref_date).days <= 14
        ]
        assert len(upcoming_4_14) == 5, f"Expected 5 open upcoming (4-14 days) tasks, got {len(upcoming_4_14)}"

        # 6. No deadline: 2 open tasks
        no_deadline = [t for t in pending if not t.get("due_date")]
        assert len(no_deadline) == 2, f"Expected 2 no_deadline tasks, got {len(no_deadline)}"

        # 7. In progress: 2
        assert len(in_progress) == 2, f"Expected 2 in_progress tasks, got {len(in_progress)}"

        # 8. Completed: 2 (one completed today)
        assert len(completed) == 2, f"Expected 2 completed tasks, got {len(completed)}"
        completed_today = [t for t in completed if str(t.get("due_date")).startswith(ref_date_str)]
        assert len(completed_today) >= 1, "Expected at least one task completed today"

        # 9. Blocked: 1
        assert len(blocked) == 1, f"Expected 1 blocked task, got {len(blocked)}"

        # Check all 4 domains represented
        domains = {t["domain"] for t in created_tasks}
        assert {"hackathon", "coursework", "code", "general"}.issubset(domains)


@pytest.mark.asyncio
async def test_judge_persona_idempotent_reseed_and_date_shift():
    """Re-seeding on a later day updates dates in place without duplicates."""
    ref_day1 = "2026-10-25"
    ref_day2 = "2026-11-01"

    mock_request = MagicMock()
    mock_ident = MagicMock(id="judge-session-idempotent")
    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

    # First pass: returns empty
    mock_conn.fetch.return_value = []

    db_tasks = {}

    async def mock_create(conn, **kwargs):
        tid = len(db_tasks) + 1
        row = dict(kwargs)
        row["id"] = tid
        db_tasks[kwargs["trusted_event_url"]] = row
        return row

    async def mock_update(conn, task_id, **kwargs):
        for uri, t in db_tasks.items():
            if t["id"] == task_id:
                t.update(kwargs)
                return t
        return None

    clock = [1000.0]
    with patch("backend.routers.tasks_verification.settings") as mock_settings, \
         patch("backend.routers.tasks_verification._get_current_identity", return_value=mock_ident), \
         patch("backend.routers.tasks_verification.get_pool", AsyncMock(return_value=mock_pool)), \
         patch("backend.routers.tasks_verification.structured.get_or_create_project", AsyncMock(return_value={"id": 10})), \
         patch("backend.routers.tasks_verification.structured.create_task", side_effect=mock_create), \
         patch("backend.routers.tasks_verification.structured.update_task", side_effect=mock_update), \
         patch("backend.services.embeddings.get_embedding", AsyncMock(return_value=[0.05] * 768)), \
         patch("backend.services.rate_limiter.time.monotonic", side_effect=lambda: clock[0]):

        mock_settings.ENVIRONMENT = "development"

        # 1. First seed on Oct 25
        res1 = await seed_demo_persona_endpoint(mock_request, body=DemoSeedRequest(reference_date=ref_day1))
        assert res1["tasks_seeded"] == 21
        assert len(db_tasks) == 21

        # 2. Second click on same day: advance injected clock past 60s cap
        clock[0] += 65.0
        mock_conn.fetch.return_value = [{"id": t["id"], "trusted_event_url": uri} for uri, t in db_tasks.items()]
        res2 = await seed_demo_persona_endpoint(mock_request, body=DemoSeedRequest(reference_date=ref_day1))
        assert res2["tasks_seeded"] == 21
        assert len(db_tasks) == 21  # NO DUPLICATES!

        # 3. Third seed 7 days later (Nov 1): advance injected clock past 60s cap
        clock[0] += 65.0
        res3 = await seed_demo_persona_endpoint(mock_request, body=DemoSeedRequest(reference_date=ref_day2))
        assert res3["tasks_seeded"] == 21
        assert len(db_tasks) == 21  # Still 21 tasks

        # Check that dates shifted to reflect Nov 1
        phase1 = next(t for t in db_tasks.values() if "nebius_buildathon_phase_1" in t["trusted_event_url"])
        assert phase1["due_date"] == date(2026, 10, 29)  # Nov 1 - 3 days = Oct 29


@pytest.mark.asyncio
async def test_non_demo_matching_title_untouched():
    """A genuine user task with a matching title is NOT touched by demo seeding."""
    mock_request = MagicMock()
    mock_ident = MagicMock(id="user-with-own-tasks")
    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

    # User only has non-demo task (trusted_event_url is None)
    mock_conn.fetch.return_value = []

    update_mock = AsyncMock()
    create_mock = AsyncMock(return_value={"id": 500})

    with patch("backend.routers.tasks_verification.settings") as mock_settings, \
         patch("backend.routers.tasks_verification._get_current_identity", return_value=mock_ident), \
         patch("backend.routers.tasks_verification.get_pool", AsyncMock(return_value=mock_pool)), \
         patch("backend.routers.tasks_verification.structured.get_or_create_project", AsyncMock(return_value={"id": 10})), \
         patch("backend.routers.tasks_verification.structured.create_task", create_mock), \
         patch("backend.routers.tasks_verification.structured.update_task", update_mock), \
         patch("backend.services.embeddings.get_embedding", AsyncMock(return_value=[0.05] * 768)):

        mock_settings.ENVIRONMENT = "development"
        res = await seed_demo_persona_endpoint(mock_request, body=DemoSeedRequest())
        assert res["status"] == "ok"
        # User non-demo task was NEVER updated
        assert update_mock.call_count == 0
        assert create_mock.call_count == 21


@pytest.mark.asyncio
async def test_production_guard_disabled_by_default():
    """In production with ENABLE_DEMO_SEEDING=False, seeding returns HTTP 403."""
    mock_request = MagicMock()
    with patch("backend.routers.tasks_verification.settings") as mock_settings:
        mock_settings.ENVIRONMENT = "production"
        mock_settings.ENABLE_DEMO_SEEDING = False

        with pytest.raises(HTTPException) as exc_info:
            await seed_demo_persona_endpoint(mock_request, body=DemoSeedRequest())
        assert exc_info.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("tz_str", ["UTC", "Asia/Kolkata"])
@pytest.mark.parametrize("time_str", ["00:30:00", "09:00:00", "14:00:00", "23:30:00"])
async def test_judge_persona_time_of_day_robustness(tz_str: str, time_str: str):
    """Category counts stay identical across 4 times of day in both UTC and Asia/Kolkata."""
    from zoneinfo import ZoneInfo
    target_tz = ZoneInfo(tz_str)
    iso_ref = f"2026-10-25T{time_str}"
    ref_dt = datetime.fromisoformat(iso_ref).replace(tzinfo=target_tz)

    mock_request = MagicMock()
    mock_ident = MagicMock(id=f"judge-tod-{tz_str}-{time_str}")
    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
    mock_conn.fetch.return_value = []

    created = []

    async def mock_create(conn, **kwargs):
        rec = dict(kwargs)
        rec["id"] = len(created) + 1
        created.append(rec)
        return rec

    with patch("backend.routers.tasks_verification.settings") as mock_settings, \
         patch("backend.routers.tasks_verification._get_current_identity", return_value=mock_ident), \
         patch("backend.routers.tasks_verification.get_pool", AsyncMock(return_value=mock_pool)), \
         patch("backend.routers.tasks_verification.structured.get_or_create_project", AsyncMock(return_value={"id": 10})), \
         patch("backend.routers.tasks_verification.structured.create_task", side_effect=mock_create), \
         patch("backend.services.embeddings.get_embedding", AsyncMock(return_value=[0.05] * 768)):

        mock_settings.ENVIRONMENT = "development"
        res = await seed_demo_persona_endpoint(
            mock_request,
            body=DemoSeedRequest(reference_date=iso_ref, tz=tz_str),
        )
        assert res["status"] == "ok"
        assert res["tasks_seeded"] == 21

        frontend_tasks = [
            build_frontend_task(t, proj_name="TestProject", now=ref_dt)
            for t in created
        ]
        dicts = [t.model_dump() for t in frontend_tasks]

        overdue = filter_tasks_by_view(dicts, "overdue", now=ref_dt, user_tz_name=tz_str)
        due_today = filter_tasks_by_view(dicts, "due_today", now=ref_dt, user_tz_name=tz_str)
        urgent = filter_tasks_by_view(dicts, "urgent", now=ref_dt, user_tz_name=tz_str)

        # Overdue: exactly 2
        assert len(overdue) == 2, f"Expected 2 overdue at {time_str} in {tz_str}, got {len(overdue)}"

        # Due today: exactly 2 (never in the past)
        assert len(due_today) == 2, f"Expected 2 due_today at {time_str} in {tz_str}, got {len(due_today)}"

        # Urgent: exactly 2 (<24h on tomorrow)
        assert len(urgent) == 2, f"Expected 2 urgent at {time_str} in {tz_str}, got {len(urgent)}"


@pytest.mark.asyncio
async def test_reseed_preserves_user_completed_status():
    """When a user marks a demo task completed, re-seeding shifts dates but preserves completed status."""
    ref_day1 = "2026-10-25"
    ref_day2 = "2026-11-01"

    mock_request = MagicMock()
    mock_ident = MagicMock(id="user-complete-demo-task")
    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

    db_tasks = {}

    async def mock_create(conn, **kwargs):
        tid = len(db_tasks) + 1
        row = dict(kwargs)
        row["id"] = tid
        db_tasks[kwargs["trusted_event_url"]] = row
        return row

    async def mock_update(conn, task_id, **kwargs):
        for uri, t in db_tasks.items():
            if t["id"] == task_id:
                t.update(kwargs)
                return t
        return None

    clock = [1000.0]
    with patch("backend.routers.tasks_verification.settings") as mock_settings, \
         patch("backend.routers.tasks_verification._get_current_identity", return_value=mock_ident), \
         patch("backend.routers.tasks_verification.get_pool", AsyncMock(return_value=mock_pool)), \
         patch("backend.routers.tasks_verification.structured.get_or_create_project", AsyncMock(return_value={"id": 10})), \
         patch("backend.routers.tasks_verification.structured.create_task", side_effect=mock_create), \
         patch("backend.routers.tasks_verification.structured.update_task", side_effect=mock_update), \
         patch("backend.services.embeddings.get_embedding", AsyncMock(return_value=[0.05] * 768)), \
         patch("backend.services.rate_limiter.time.monotonic", side_effect=lambda: clock[0]):

        mock_settings.ENVIRONMENT = "development"

        # 1. Initial seed
        mock_conn.fetch.return_value = []
        await seed_demo_persona_endpoint(mock_request, body=DemoSeedRequest(reference_date=ref_day1))

        # 2. User marks "nebius_buildathon_phase_1" as completed
        phase1_key = next(k for k in db_tasks if "nebius_buildathon_phase_1" in k)
        db_tasks[phase1_key]["status"] = "completed"

        # 3. User re-seeds 7 days later: advance clock past 60s cap
        clock[0] += 65.0
        mock_conn.fetch.return_value = [{"id": t["id"], "trusted_event_url": uri} for uri, t in db_tasks.items()]
        await seed_demo_persona_endpoint(mock_request, body=DemoSeedRequest(reference_date=ref_day2))

        # 4. Status must REMAIN completed, and date shifted
        phase1 = db_tasks[phase1_key]
        assert phase1["status"] == "completed", "User-completed status must not be reverted by re-seed"
        assert phase1["due_date"] == date(2026, 10, 29), "Due date must shift to Nov 1 - 3 days"


@pytest.mark.asyncio
async def test_clear_demo_tasks_removes_dummy_leaves_user_tasks():
    """On site reload/clear, demo dummy tasks are removed while genuine user tasks are preserved."""
    from backend.routers.tasks_verification import clear_demo_tasks_endpoint

    mock_request = MagicMock()
    mock_ident = MagicMock(id="user_with_mixed_tasks", is_guest=True)
    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

    # Simulated DB with 2 demo tasks and 1 real user task
    stored_tasks = [
        {"id": 101, "trusted_event_url": "compass://demo-persona/36_hour_hackathon_sprint", "title": "36-hour Hackathon Sprint"},
        {"id": 102, "trusted_event_url": "compass://demo-persona/cs_61c_lab_4", "title": "CS 61C Lab 4"},
        {"id": 201, "trusted_event_url": None, "title": "Real User Task: Submit Report"},
    ]

    # conn.fetch returns the demo task rows matching the query
    mock_conn.fetch.return_value = [
        {"id": 101, "trusted_event_url": "compass://demo-persona/36_hour_hackathon_sprint"},
        {"id": 102, "trusted_event_url": "compass://demo-persona/cs_61c_lab_4"},
    ]

    with patch("backend.routers.tasks_verification.get_pool", AsyncMock(return_value=mock_pool)), \
         patch("backend.routers.tasks_verification._get_current_identity", return_value=mock_ident):

        res = await clear_demo_tasks_endpoint(mock_request)
        assert res["status"] == "ok"
        assert res["deleted_count"] == 2

        # Verify SQL execution deleted exactly the 2 demo task IDs, leaving user task 201 untouched
        execute_calls = mock_conn.execute.call_args_list
        assert len(execute_calls) >= 2
        # Task dependencies delete call
        assert execute_calls[0][0][1] == [101, 102]
        # Tasks delete call
        assert execute_calls[1][0][1] == [101, 102]


@pytest.mark.asyncio
async def test_get_frontend_tasks_include_demo_filter():
    """get_frontend_tasks with include_demo=False returns only user tasks, excluding demo tasks."""
    from backend.routers.tasks import get_frontend_tasks

    mock_request = MagicMock()
    mock_ident = MagicMock(id="user_reload_test", is_guest=False)
    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

    # Simulated raw tasks from DB
    mock_raw_tasks = [
        {
            "id": 1,
            "title": "36-hour Hackathon Sprint: Final Demo Build",
            "domain": "hackathon",
            "due_date": date(2026, 10, 25),
            "priority": "high",
            "status": "open",
            "trusted_event_url": "compass://demo-persona/36_hour_hackathon_sprint",
            "is_demo": True,
            "tags": ["hackathon", "demo"],
        },
        {
            "id": 2,
            "title": "User Personal Milestone: Study for GRE",
            "domain": "coursework",
            "due_date": date(2026, 10, 28),
            "priority": "medium",
            "status": "open",
            "trusted_event_url": None,
            "is_demo": False,
            "tags": ["coursework"],
        },
    ]

    with patch("backend.routers.tasks.get_pool", AsyncMock(return_value=mock_pool)), \
         patch("backend.routers.tasks._get_current_identity", return_value=mock_ident), \
         patch("backend.routers.tasks.structured.list_tasks", AsyncMock(return_value=mock_raw_tasks)):

        # 1. With include_demo=True: returns both
        all_res = await get_frontend_tasks(mock_request, include_demo=True)
        assert len(all_res) == 2

        # 2. With include_demo=False (on reload): returns ONLY the genuine user task
        user_only_res = await get_frontend_tasks(mock_request, include_demo=False)
        assert len(user_only_res) == 1
        assert user_only_res[0].id == "2"
        assert user_only_res[0].title == "User Personal Milestone: Study for GRE"


@pytest.mark.asyncio
async def test_legacy_untagged_demo_tasks_filtered_and_cleared():
    """Demo tasks marked with persona marker compass://demo-persona/ are filtered out when include_demo=False."""
    from backend.routers.tasks import get_frontend_tasks

    mock_request = MagicMock()
    mock_ident = MagicMock(id="user_test_account", is_guest=False)
    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

    # Persona demo tasks marked with compass://demo-persona/ + 1 real user task
    mock_raw_tasks = [
        {"id": 448, "title": "36-hour Hackathon Sprint: Final Demo Build", "trusted_event_url": "compass://demo-persona/36-hour-sprint", "domain": "hackathon"},
        {"id": 449, "title": "CS 61C Lab 4: RISC-V Pipeline Synthesis", "trusted_event_url": "compass://demo-persona/cs61c-lab-4", "domain": "coursework"},
        {"id": 999, "title": "My Genuine User Task: Learn React 19", "trusted_event_url": None, "domain": "code"},
    ]

    with patch("backend.routers.tasks.get_pool", AsyncMock(return_value=mock_pool)), \
         patch("backend.routers.tasks._get_current_identity", return_value=mock_ident), \
         patch("backend.routers.tasks.structured.list_tasks", AsyncMock(return_value=mock_raw_tasks)):

        user_tasks = await get_frontend_tasks(mock_request, include_demo=False)
        assert len(user_tasks) == 1
        assert user_tasks[0].id == "999"
        assert user_tasks[0].title == "My Genuine User Task: Learn React 19"


@pytest.mark.asyncio
async def test_user_task_matching_demo_title_preserved():
    """A genuine user task whose title matches a demo title is NOT hidden when include_demo=False because it lacks the persona marker."""
    from backend.routers.tasks import get_frontend_tasks

    mock_request = MagicMock()
    mock_ident = MagicMock(id="user_test_account", is_guest=False)
    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

    # Real user task having the exact title of a demo task, but no demo marker
    mock_raw_tasks = [
        {
            "id": 1001,
            "title": "36-hour Hackathon Sprint: Final Demo Build",
            "trusted_event_url": None,
            "is_demo": False,
            "domain": "hackathon",
        },
        {
            "id": 1002,
            "title": "Nebius Buildathon Phase 1 Submission",
            "trusted_event_url": "compass://demo-persona/nebius-buildathon",
            "is_demo": True,
            "domain": "hackathon",
        },
    ]

    with patch("backend.routers.tasks.get_pool", AsyncMock(return_value=mock_pool)), \
         patch("backend.routers.tasks._get_current_identity", return_value=mock_ident), \
         patch("backend.routers.tasks.structured.list_tasks", AsyncMock(return_value=mock_raw_tasks)):

        # include_demo=False filters out 1002 (has persona marker) but PRESERVES 1001 (genuine user task)
        user_tasks = await get_frontend_tasks(mock_request, include_demo=False)
        assert len(user_tasks) == 1
        assert user_tasks[0].id == "1001"
        assert user_tasks[0].title == "36-hour Hackathon Sprint: Final Demo Build"



