"""
Unit test verifying that a user with 0 tasks sees exactly 0 tasks on EVERY read path,
even when NULL-owner rows (user_id IS NULL) and other-tenant rows exist in the database.

Read paths tested:
1. Tasks list endpoint: get_frontend_tasks (/tasks and /api/tasks)
2. Dashboard endpoint: get_dashboard (/dashboard and /api/dashboard)
3. Timeline endpoint: get_timeline (/api/memory/timeline)
4. Vector similarity search: backend.memory.vector.search_chunks
5. Calendar sync/deadlines: backend.services.calendar.sync_all_tasks_to_google_calendar
6. Structured list_tasks: backend.memory.structured.list_tasks
7. Feasibility agent task fetcher: backend.agents.feasibility._fetch_open_tasks
8. Skills deadline conflicts handler: backend.skills.handlers.tasks.handle_detect_deadline_conflicts
9. Skills summarize day handler: backend.skills.handlers.context.handle_summarize_day
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


@pytest.fixture
def mock_db_with_mixed_rows():
    """
    Simulates a database table containing:
    - 2 NULL-owner rows (user_id = None)
    - 2 other-tenant rows (user_id = 'tenant-other')
    - 0 rows for target user ('user-target')
    """
    rows = [
        {
            "id": 1,
            "title": "NULL Owner Task 1",
            "domain": "code",
            "priority": "high",
            "status": "open",
            "due_date": datetime.now(timezone.utc),
            "user_id": None,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "notes": "Orphaned legacy row",
            "project_id": None,
            "duration_minutes": 60,
            "scheduled_start": None,
            "scheduled_end": None,
            "is_fixed": False,
            "recurrence_rule": None,
            "trusted_event_url": None,
            "project_name": None,
        },
        {
            "id": 2,
            "title": "NULL Owner Task 2",
            "domain": "coursework",
            "priority": "medium",
            "status": "open",
            "due_date": None,
            "user_id": None,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "notes": "Another orphan",
            "project_id": None,
            "duration_minutes": 30,
            "scheduled_start": None,
            "scheduled_end": None,
            "is_fixed": False,
            "recurrence_rule": None,
            "trusted_event_url": None,
            "project_name": None,
        },
        {
            "id": 3,
            "title": "Other Tenant Task 1",
            "domain": "code",
            "priority": "high",
            "status": "open",
            "due_date": datetime.now(timezone.utc),
            "user_id": "tenant-other",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "notes": "Other tenant data",
            "project_id": None,
            "duration_minutes": 45,
            "scheduled_start": None,
            "scheduled_end": None,
            "is_fixed": False,
            "recurrence_rule": None,
            "trusted_event_url": None,
            "project_name": None,
        },
    ]

    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

    async def fake_fetch(query, *args):
        # Strict tenant query: if user_id is 'user-target', 0 rows match
        for arg in args:
            if arg == "user-target":
                return []
            if arg == "tenant-other":
                return [r for r in rows if r["user_id"] == "tenant-other"]
        # If query executes with user_id = None or without tenant filter, simulate leakage risk
        return [r for r in rows if r["user_id"] is None]

    mock_conn.fetch.side_effect = fake_fetch
    return mock_pool, mock_conn


@pytest.mark.asyncio
async def test_read_path_1_get_tasks_filters_null_and_other_tenants(mock_db_with_mixed_rows):
    """GET /tasks and /api/tasks returns [] for user-target."""
    from backend.routers.tasks import get_frontend_tasks

    mock_pool, _ = mock_db_with_mixed_rows
    mock_req = MagicMock()
    mock_req.headers = {}
    mock_req.cookies = {}

    target_ident = MagicMock(id="user-target", is_guest=False)

    with patch("backend.routers.tasks.get_pool", AsyncMock(return_value=mock_pool)), \
         patch("backend.routers.tasks._get_current_identity", return_value=target_ident):
        tasks = await get_frontend_tasks(mock_req)
        assert tasks == []
        assert len(tasks) == 0


@pytest.mark.asyncio
async def test_read_path_2_get_dashboard_filters_null_and_other_tenants(mock_db_with_mixed_rows):
    """GET /dashboard and /api/dashboard returns 0 in all category lists for user-target."""
    from backend.routers.tasks import get_dashboard

    mock_pool, _ = mock_db_with_mixed_rows
    mock_req = MagicMock()
    mock_req.headers = {}
    mock_req.cookies = {}

    target_ident = MagicMock(id="user-target", is_guest=False)

    with patch("backend.routers.tasks.get_pool", AsyncMock(return_value=mock_pool)), \
         patch("backend.routers.tasks._get_current_identity", return_value=target_ident):
        dash = await get_dashboard(mock_req)
        assert dash.total_open_tasks == 0
        assert dash.total_projects == 0
        for domain_stats in dash.domains.values():
            assert domain_stats.open_task_count == 0


@pytest.mark.asyncio
async def test_read_path_3_get_timeline_filters_null_and_other_tenants(mock_db_with_mixed_rows):
    """GET /api/memory/timeline returns empty events for user-target."""
    from backend.routers.tasks import get_timeline

    mock_pool, _ = mock_db_with_mixed_rows
    mock_req = MagicMock()
    mock_req.headers = {}
    mock_req.cookies = {}

    target_ident = MagicMock(id="user-target", is_guest=False)

    with patch("backend.routers.tasks.get_pool", AsyncMock(return_value=mock_pool)), \
         patch("backend.routers.tasks._get_current_identity", return_value=target_ident):
        timeline = await get_timeline(mock_req)
        assert timeline.entries == []
        assert timeline.total == 0


@pytest.mark.asyncio
async def test_read_path_4_vector_search_chunks(mock_db_with_mixed_rows):
    """backend.memory.vector.search_chunks returns [] for user-target and for None."""
    from backend.memory.vector import search_chunks

    _, mock_conn = mock_db_with_mixed_rows

    with patch("backend.memory.vector.get_embedding", AsyncMock(return_value=[0.1] * 768)):
        res_target = await search_chunks(mock_conn, query="test query", user_id="user-target")
        assert res_target == []

        res_none = await search_chunks(mock_conn, query="test query", user_id=None)
        assert res_none == []


@pytest.mark.asyncio
async def test_read_path_5_calendar_sync(mock_db_with_mixed_rows):
    """backend.services.calendar.sync_all_tasks_to_google_calendar returns 0 for user-target and for None."""
    from backend.services.calendar import sync_all_tasks_to_google_calendar

    mock_pool, _ = mock_db_with_mixed_rows

    res_target = await sync_all_tasks_to_google_calendar(mock_pool, user_id="user-target")
    assert res_target["count"] == 0

    res_none = await sync_all_tasks_to_google_calendar(mock_pool, user_id=None)
    assert res_none["count"] == 0


@pytest.mark.asyncio
async def test_read_path_6_structured_list_tasks(mock_db_with_mixed_rows):
    """backend.memory.structured.list_tasks returns [] for user-target."""
    from backend.memory.structured import list_tasks

    _, mock_conn = mock_db_with_mixed_rows

    res_target = await list_tasks(mock_conn, user_id="user-target")
    assert res_target == []


@pytest.mark.asyncio
async def test_read_path_7_feasibility_fetch_open_tasks(mock_db_with_mixed_rows):
    """backend.agents.feasibility._fetch_open_tasks returns [] for user-target."""
    from backend.agents.feasibility import _fetch_open_tasks

    mock_pool, _ = mock_db_with_mixed_rows

    res_target = await _fetch_open_tasks(mock_pool, domain=None, user_id="user-target")
    assert res_target == []


@pytest.mark.asyncio
async def test_read_path_8_deadline_conflicts_handler(mock_db_with_mixed_rows):
    """backend.skills.handlers.tasks.handle_detect_deadline_conflicts returns 0 conflicts for user-target."""
    from backend.skills.handlers.tasks import handle_detect_deadline_conflicts

    mock_pool, _ = mock_db_with_mixed_rows

    res = await handle_detect_deadline_conflicts({"user_id": "user-target"}, pool=mock_pool)
    assert res.get("data", {}).get("conflicts_count") == 0
    assert res.get("data", {}).get("scanned_tasks_count") == 0


@pytest.mark.asyncio
async def test_read_path_9_summarize_day_handler(mock_db_with_mixed_rows):
    """backend.skills.handlers.context.handle_summarize_day returns 0 tasks for user-target."""
    from backend.skills.handlers.context import handle_summarize_day

    mock_pool, _ = mock_db_with_mixed_rows

    with patch("openai.AsyncOpenAI") as mock_openai:
        mock_client = AsyncMock()
        mock_openai.return_value = mock_client
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="Summary: 0 open tasks."))]
        )
        res = await handle_summarize_day({"user_id": "user-target"}, pool=mock_pool)
        assert res.get("data", {}).get("total") == 0
