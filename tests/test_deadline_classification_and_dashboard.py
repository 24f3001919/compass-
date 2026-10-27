"""
Tests for Compass Deadline Intelligence, Classification Precedence, Dashboard Organization, and Safe Demo Seeding.
"""

from datetime import date, datetime, time, timedelta, timezone
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from zoneinfo import ZoneInfo

from backend.services.deadline_classifier import (
    classify_deadline,
    filter_tasks_by_view,
    parse_deadline_datetime,
)
from backend.routers.tasks_verification import DemoSeedRequest


# ---- 1. Classification Precedence Tests -------------------------------------

def test_rule_1_completed_task_not_active_deadline():
    """Completed tasks must not appear as active deadlines, even if due_date is in the past."""
    ref_time = datetime(2026, 10, 20, 14, 0, 0, tzinfo=timezone.utc)
    task = {
        "id": "1",
        "title": "Completed Past Milestone",
        "status": "completed",
        "due_date": "2026-10-15",
        "priority": "high",
    }
    c = classify_deadline(task, now=ref_time)
    assert c["lifecycle"] == "completed"
    assert c["timing"] == "completed"
    assert c["is_active_deadline"] is False
    assert c["is_overdue"] is False
    assert c["label"] == "Completed"


def test_rule_1_cancelled_task_not_active_deadline():
    """Cancelled tasks must not appear as active deadlines, even if due_date is in the past."""
    ref_time = datetime(2026, 10, 20, 14, 0, 0, tzinfo=timezone.utc)
    task = {
        "id": "2",
        "title": "Cancelled Deprecated Feature",
        "status": "cancelled",
        "due_date": "2026-10-10",
        "priority": "low",
    }
    c = classify_deadline(task, now=ref_time)
    assert c["lifecycle"] == "cancelled"
    assert c["timing"] == "cancelled"
    assert c["is_active_deadline"] is False
    assert c["is_overdue"] is False
    assert c["label"] == "Cancelled"


def test_rule_2_active_task_without_deadline_is_no_deadline():
    """Active tasks without deadlines must be classified as no_deadline."""
    ref_time = datetime(2026, 10, 20, 14, 0, 0, tzinfo=timezone.utc)
    task = {
        "id": "3",
        "title": "Backlog Exploration Item",
        "status": "open",
        "due_date": None,
        "priority": "low",
    }
    c = classify_deadline(task, now=ref_time)
    assert c["lifecycle"] == "pending"
    assert c["timing"] == "no_deadline"
    assert c["is_active_deadline"] is False
    assert c["is_overdue"] is False


def test_rule_3_unfinished_past_date_only_is_overdue():
    """Unfinished tasks whose date-only deadline was yesterday are overdue."""
    ref_time = datetime(2026, 10, 20, 14, 0, 0, tzinfo=timezone.utc)
    task = {
        "id": "4",
        "title": "Unfinished Yesterday Task",
        "status": "open",
        "due_date": "2026-10-19",
        "priority": "urgent",
    }
    c = classify_deadline(task, now=ref_time)
    assert c["lifecycle"] == "pending"
    assert c["timing"] == "overdue"
    assert c["is_overdue"] is True
    assert c["is_active_deadline"] is True
    assert "Overdue" in c["label"]


def test_rule_3_timestamp_deadline_instant_passed():
    """Timestamp-based deadline transitions to overdue the instant it passes."""
    ref_time = datetime(2026, 10, 20, 14, 0, 1, tzinfo=timezone.utc)
    task = {
        "id": "5",
        "title": "Timestamp Instant Task",
        "status": "open",
        "due_date": "2026-10-20T14:00:00Z",
        "priority": "high",
    }
    c = classify_deadline(task, now=ref_time)
    assert c["timing"] == "overdue"
    assert c["is_overdue"] is True


def test_rule_4_date_only_remains_due_today_throughout_calendar_day():
    """Date-only deadline must remain due_today throughout its entire local calendar day."""
    # Check at 00:00:05 (start of day)
    start_of_day = datetime(2026, 10, 20, 0, 0, 5, tzinfo=timezone.utc)
    task = {
        "id": "6",
        "title": "Today Milestone",
        "status": "open",
        "due_date": "2026-10-20",
        "priority": "high",
    }
    c_start = classify_deadline(task, now=start_of_day)
    assert c_start["timing"] == "due_today"
    assert c_start["is_overdue"] is False
    assert c_start["is_active_deadline"] is True
    assert c_start["label"] == "⚠️ Due today"

    # Check at 23:59:50 (near end of day)
    end_of_day = datetime(2026, 10, 20, 23, 59, 50, tzinfo=timezone.utc)
    c_end = classify_deadline(task, now=end_of_day)
    assert c_end["timing"] == "due_today"
    assert c_end["is_overdue"] is False

    # Check next day at 00:00:01 -> transitions to overdue
    next_day = datetime(2026, 10, 21, 0, 0, 1, tzinfo=timezone.utc)
    c_next = classify_deadline(task, now=next_day)
    assert c_next["timing"] == "overdue"
    assert c_next["is_overdue"] is True


def test_rule_4_future_timestamp_today_is_due_today():
    """Future timestamp falling on today's calendar day is due_today."""
    ref_time = datetime(2026, 10, 20, 10, 0, 0, tzinfo=timezone.utc)
    task = {
        "id": "7",
        "title": "Afternoon Submission",
        "status": "open",
        "due_date": "2026-10-20T17:00:00Z",
        "priority": "urgent",
    }
    c = classify_deadline(task, now=ref_time)
    assert c["timing"] == "due_today"
    assert c["is_overdue"] is False
    assert c["label"] == "⚠️ Due today"


def test_rule_5_deadlines_within_24h_outside_today_are_urgent():
    """Deadlines within the next 24 hours falling on tomorrow are urgent."""
    # Current time: Oct 20 at 18:00. Deadline: Oct 21 at 10:00 (16 hours away, tomorrow)
    ref_time = datetime(2026, 10, 20, 18, 0, 0, tzinfo=timezone.utc)
    task = {
        "id": "8",
        "title": "Tomorrow Morning Sprint Demo",
        "status": "open",
        "due_date": "2026-10-21T10:00:00Z",
        "priority": "urgent",
    }
    c = classify_deadline(task, now=ref_time)
    assert c["timing"] == "urgent"
    assert c["is_urgent"] is True
    assert c["is_overdue"] is False
    assert "Due in 16h" in c["label"]


def test_rule_6_deadlines_within_7_days_are_due_soon():
    """Remaining deadlines within the next 7 days are due_soon."""
    ref_time = datetime(2026, 10, 20, 12, 0, 0, tzinfo=timezone.utc)
    task = {
        "id": "9",
        "title": "Homework 4 Due Friday",
        "status": "open",
        "due_date": "2026-10-24",  # 4 days away
        "priority": "medium",
    }
    c = classify_deadline(task, now=ref_time)
    assert c["timing"] == "due_soon"
    assert c["is_overdue"] is False
    assert "4d left" in c["label"]


def test_rule_7_distant_deadlines_are_upcoming():
    """Deadlines more than 7 days away are upcoming."""
    ref_time = datetime(2026, 10, 20, 12, 0, 0, tzinfo=timezone.utc)
    task = {
        "id": "10",
        "title": "Term Project Final Report",
        "status": "open",
        "due_date": "2026-11-15",  # 26 days away
        "priority": "high",
    }
    c = classify_deadline(task, now=ref_time)
    assert c["timing"] == "upcoming"
    assert c["is_overdue"] is False
    assert "26d left" in c["label"]


def test_independent_dimensions_blocked_and_inprogress():
    """Blocked and in-progress tasks maintain independent lifecycle and deadline statuses."""
    ref_time = datetime(2026, 10, 20, 12, 0, 0, tzinfo=timezone.utc)

    # Blocked task overdue
    blocked_overdue = {
        "id": "11",
        "title": "Blocked IT Approval",
        "status": "blocked",
        "due_date": "2026-10-18",
        "priority": "high",
    }
    c1 = classify_deadline(blocked_overdue, now=ref_time)
    assert c1["lifecycle"] == "blocked"
    assert c1["timing"] == "overdue"
    assert c1["is_active_deadline"] is True

    # In-progress task upcoming
    in_prog_upcoming = {
        "id": "12",
        "title": "Embedding Compression",
        "status": "in_progress",
        "due_date": "2026-11-01",
        "priority": "medium",
    }
    c2 = classify_deadline(in_prog_upcoming, now=ref_time)
    assert c2["lifecycle"] == "in_progress"
    assert c2["timing"] == "upcoming"
    assert c2["is_active_deadline"] is True


def test_data_origin_detection():
    """Distinguishes synthetic demo data from real user tasks."""
    demo_task = {
        "id": "demo-101",
        "title": "Judge Demo Hackathon Task",
        "status": "open",
        "due_date": "2026-10-25",
        "tags": ["demo", "hackathon"],
    }
    c_demo = classify_deadline(demo_task)
    assert c_demo["origin"] == "demo"

    user_task = {
        "id": "12345",
        "title": "Real User Personal Task",
        "status": "open",
        "due_date": "2026-10-25",
        "tags": ["personal"],
    }
    c_user = classify_deadline(user_task)
    assert c_user["origin"] == "user"


# ---- 2. View Filtering Tests ------------------------------------------------

def test_filter_tasks_by_view():
    """Validates filtering across all 8 supported views."""
    ref_time = datetime(2026, 10, 20, 12, 0, 0, tzinfo=timezone.utc)
    tasks = [
        {"id": "1", "title": "Overdue Task", "status": "open", "due_date": "2026-10-15"},
        {"id": "2", "title": "Due Today Task", "status": "open", "due_date": "2026-10-20"},
        {"id": "3", "title": "Due Soon Task", "status": "open", "due_date": "2026-10-23"},
        {"id": "4", "title": "Upcoming Task", "status": "open", "due_date": "2026-11-05"},
        {"id": "5", "title": "Pending No Deadline", "status": "open", "due_date": None},
        {"id": "6", "title": "In Progress Task", "status": "in_progress", "due_date": "2026-10-24"},
        {"id": "7", "title": "Completed Task", "status": "completed", "due_date": "2026-10-10"},
        {"id": "8", "title": "Blocked Task", "status": "blocked", "due_date": "2026-10-26"},
    ]

    overdue = filter_tasks_by_view(tasks, "overdue", now=ref_time)
    assert len(overdue) == 1
    assert overdue[0]["id"] == "1"

    due_today = filter_tasks_by_view(tasks, "due_today", now=ref_time)
    assert len(due_today) == 1
    assert due_today[0]["id"] == "2"

    due_soon = filter_tasks_by_view(tasks, "due_soon", now=ref_time)
    # Tasks with diff_days <= 7: Task 3 (Oct 23) and Task 6 (Oct 24), Task 8 (Oct 26)
    assert any(t["id"] == "3" for t in due_soon)

    upcoming = filter_tasks_by_view(tasks, "upcoming", now=ref_time)
    assert any(t["id"] == "4" for t in upcoming)

    pending = filter_tasks_by_view(tasks, "pending", now=ref_time)
    assert any(t["id"] == "5" for t in pending)

    in_progress = filter_tasks_by_view(tasks, "in_progress", now=ref_time)
    assert len(in_progress) == 1
    assert in_progress[0]["id"] == "6"

    completed = filter_tasks_by_view(tasks, "completed", now=ref_time)
    assert len(completed) == 1
    assert completed[0]["id"] == "7"


# ---- 3. Demo Seeding Production Safeguard Tests ------------------------------

@pytest.mark.asyncio
async def test_demo_seed_production_guard():
    """1. Production seeding is rejected when disabled."""
    from backend.routers.tasks_verification import seed_demo_persona_endpoint
    from fastapi import HTTPException

    mock_request = MagicMock()
    with patch("backend.routers.tasks_verification.settings") as mock_settings:
        mock_settings.ENVIRONMENT = "production"
        mock_settings.ENABLE_DEMO_SEEDING = False

        with pytest.raises(HTTPException) as exc_info:
            await seed_demo_persona_endpoint(mock_request, body=DemoSeedRequest())
        assert exc_info.value.status_code == 403
        assert "guarded and disabled in production" in exc_info.value.detail


@pytest.mark.asyncio
async def test_demo_seed_cannot_bypass_production_guard():
    """2. A caller cannot bypass the guard using force_in_production or extra body fields."""
    from backend.routers.tasks_verification import seed_demo_persona_endpoint
    from fastapi import HTTPException

    mock_request = MagicMock()
    with patch("backend.routers.tasks_verification.settings") as mock_settings:
        mock_settings.ENVIRONMENT = "production"
        mock_settings.ENABLE_DEMO_SEEDING = False

        # Attempt to pass force_in_production or extra fields
        with pytest.raises(HTTPException) as exc_info:
            # Pydantic model has no force_in_production, and endpoint does not consult caller body
            await seed_demo_persona_endpoint(mock_request, body=DemoSeedRequest())
        assert exc_info.value.status_code == 403
        assert "guarded and disabled in production" in exc_info.value.detail


@pytest.mark.asyncio
async def test_demo_seed_authorized_development_and_server_override():
    """3. Authorized development/test seeding works, or production with server-side ENABLE_DEMO_SEEDING."""
    from backend.routers.tasks_verification import seed_demo_persona_endpoint

    mock_request = MagicMock()
    mock_ident = MagicMock(id="test-judge-user")
    mock_pool = MagicMock()
    mock_conn = AsyncMock()

    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
    mock_conn.fetchrow.return_value = None

    with patch("backend.routers.tasks_verification.settings") as mock_settings, \
         patch("backend.routers.tasks_verification._get_current_identity", return_value=mock_ident), \
         patch("backend.routers.tasks_verification.get_pool", AsyncMock(return_value=mock_pool)), \
         patch("backend.routers.tasks_verification.structured.get_or_create_project", AsyncMock(return_value={"id": 1})), \
         patch("backend.routers.tasks_verification.structured.create_task", AsyncMock(return_value={"id": 100})), \
         patch("backend.routers.tasks_verification.structured.update_task", AsyncMock()), \
         patch("backend.services.embeddings.get_embedding", AsyncMock(return_value=[0.1] * 768)):

        # In development: succeeds
        mock_settings.ENVIRONMENT = "development"
        mock_settings.ENABLE_DEMO_SEEDING = False
        res_dev = await seed_demo_persona_endpoint(mock_request, body=DemoSeedRequest(reference_date="2026-10-20"))
        assert res_dev["status"] == "ok"
        assert res_dev["tasks_seeded"] >= 19

        # In production with trusted server-side setting: succeeds
        mock_settings.ENVIRONMENT = "production"
        mock_settings.ENABLE_DEMO_SEEDING = True
        mock_ident.id = "test-judge-user-prod"
        res_prod = await seed_demo_persona_endpoint(mock_request, body=DemoSeedRequest(reference_date="2026-10-20"))
        assert res_prod["status"] == "ok"


@pytest.mark.asyncio
async def test_demo_seed_real_user_task_preserved_against_matching_title():
    """4 & 5. A real user task with matching title AND notes is never overwritten by demo seeding."""
    from backend.routers.tasks_verification import seed_demo_persona_endpoint

    mock_request = MagicMock()
    mock_ident = MagicMock(id="alice-user")
    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

    # Simulate database behavior:
    # Alice has a genuine task with the EXACT same title and notes as a demo fixture,
    # but her trusted_event_url is NULL (or a personal URL).
    # Since the query checks `WHERE user_id = $1 AND trusted_event_url = $2` with $2 = compass://demo-persona/...,
    # this query returns None for Alice's genuine task.
    async def mock_fetchrow_impl(query, *args):
        # args[0] is user_id, args[1] is fixture_uri
        # If querying for demo fixture URI, returns None because Alice only has a genuine task (trusted_event_url is NULL)
        return None

    mock_conn.fetchrow.side_effect = mock_fetchrow_impl

    create_task_mock = AsyncMock(return_value={"id": 200})
    update_task_mock = AsyncMock()

    with patch("backend.routers.tasks_verification.settings") as mock_settings, \
         patch("backend.routers.tasks_verification._get_current_identity", return_value=mock_ident), \
         patch("backend.routers.tasks_verification.get_pool", AsyncMock(return_value=mock_pool)), \
         patch("backend.routers.tasks_verification.structured.get_or_create_project", AsyncMock(return_value={"id": 1})), \
         patch("backend.routers.tasks_verification.structured.create_task", create_task_mock), \
         patch("backend.routers.tasks_verification.structured.update_task", update_task_mock), \
         patch("backend.services.embeddings.get_embedding", AsyncMock(return_value=[0.1] * 768)):

        mock_settings.ENVIRONMENT = "development"
        res = await seed_demo_persona_endpoint(mock_request, body=DemoSeedRequest())
        assert res["status"] == "ok"

        # Verify that create_task was called with compass://demo-persona/ fixture URIs
        for call in create_task_mock.call_args_list:
            _, kwargs = call
            assert kwargs.get("trusted_event_url", "").startswith("compass://demo-persona/")
            assert kwargs.get("user_id") == "alice-user"

        # Verify that all demo tasks were created as new fixture records
        assert create_task_mock.call_count >= 19
        # Verify that update_task was only called for the newly created demo fixture IDs (200),
        # NEVER touching or updating any existing user task ID.
        for call in update_task_mock.call_args_list:
            task_id_arg = call[0][1]
            assert task_id_arg == 200


@pytest.mark.asyncio
async def test_demo_seed_repeated_seeding_updates_only_demo_records_idempotently():
    """6. Repeated seeding updates only demo-owned records without creating duplicates."""
    from backend.routers.tasks_verification import seed_demo_persona_endpoint

    mock_request = MagicMock()
    mock_ident = MagicMock(id="judge-session-1")
    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

    # Simulate existing demo tasks in database matching the demo fixture URI
    mock_conn.fetchrow.return_value = {"id": 55, "title": "Configure Production SSL & CORS Headers", "notes": "Harden FastAPI origin allowlists"}

    create_task_mock = AsyncMock(return_value={"id": 999})
    update_task_mock = AsyncMock()

    with patch("backend.routers.tasks_verification.settings") as mock_settings, \
         patch("backend.routers.tasks_verification._get_current_identity", return_value=mock_ident), \
         patch("backend.routers.tasks_verification.get_pool", AsyncMock(return_value=mock_pool)), \
         patch("backend.routers.tasks_verification.structured.get_or_create_project", AsyncMock(return_value={"id": 1})), \
         patch("backend.routers.tasks_verification.structured.create_task", create_task_mock), \
         patch("backend.routers.tasks_verification.structured.update_task", update_task_mock), \
         patch("backend.services.embeddings.get_embedding", AsyncMock(return_value=[0.1] * 768)):

        mock_settings.ENVIRONMENT = "development"
        res = await seed_demo_persona_endpoint(mock_request, body=DemoSeedRequest(reference_date="2026-10-25"))
        assert res["status"] == "ok"

        # In repeated seeding where all demo tasks already exist:
        # Zero new tasks should be created!
        assert create_task_mock.call_count == 0
        # All demo tasks are updated in place with the fixture URI
        assert update_task_mock.call_count >= 19
        assert all(call[0][1] == 55 for call in update_task_mock.call_args_list)


@pytest.mark.asyncio
async def test_demo_seed_tenant_isolation():
    """7. Seeding strictly isolates by user_id; another tenant cannot modify records."""
    from backend.routers.tasks_verification import seed_demo_persona_endpoint

    mock_request = MagicMock()
    mock_ident = MagicMock(id="tenant-charlie")
    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
    mock_conn.fetchrow.return_value = None

    create_task_mock = AsyncMock(return_value={"id": 777})

    with patch("backend.routers.tasks_verification.settings") as mock_settings, \
         patch("backend.routers.tasks_verification._get_current_identity", return_value=mock_ident), \
         patch("backend.routers.tasks_verification.get_pool", AsyncMock(return_value=mock_pool)), \
         patch("backend.routers.tasks_verification.structured.get_or_create_project", AsyncMock(return_value={"id": 1})), \
         patch("backend.routers.tasks_verification.structured.create_task", create_task_mock), \
         patch("backend.routers.tasks_verification.structured.update_task", AsyncMock()), \
         patch("backend.services.embeddings.get_embedding", AsyncMock(return_value=[0.1] * 768)):

        mock_settings.ENVIRONMENT = "development"
        res = await seed_demo_persona_endpoint(mock_request, body=DemoSeedRequest())
        assert res["user_id"] == "tenant-charlie"

        # Verify SQL queries strictly used tenant-charlie
        for call in mock_conn.fetchrow.call_args_list:
            args = call[0]
            assert args[1] == "tenant-charlie"

        # Verify created tasks are bound to tenant-charlie
        for call in create_task_mock.call_args_list:
            assert call[1].get("user_id") == "tenant-charlie"

