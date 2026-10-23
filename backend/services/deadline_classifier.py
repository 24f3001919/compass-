"""
Compass — Deterministic Deadline Classification Engine.

Implements strict 4-dimensional classification:
1. Lifecycle Status: pending, in_progress, completed, blocked, cancelled.
2. Deadline Timing: overdue, due_today, urgent, due_soon, upcoming, no_deadline.
3. Priority: urgent, high, medium, low.
4. Data Origin: user, demo.

Deterministic Precedence Rules:
1. Completed and cancelled tasks must not appear as active deadlines.
2. Active tasks without deadlines are no_deadline.
3. Unfinished tasks whose actual deadline has passed are overdue.
4. Future deadlines falling on the user's current local calendar day are due_today.
5. Deadlines within the next 24 hours, outside the due_today category, are urgent.
6. Remaining deadlines within the next seven days are due_soon.
7. More distant future deadlines are upcoming.

Date-only deadlines remain due_today throughout their local calendar day (ending at 23:59:59).
Timestamp-based deadlines transition to overdue the instant they pass.
"""

from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo
import logging

logger = logging.getLogger("compass.services.deadline_classifier")


def get_user_timezone(tz_name: Optional[str] = None) -> ZoneInfo:
    """Resolve timezone safely, falling back to local or UTC."""
    if tz_name:
        try:
            return ZoneInfo(tz_name)
        except Exception:
            pass
    # Default to system local timezone if detectable, else UTC
    try:
        local_tz = datetime.now().astimezone().tzinfo
        if local_tz:
            return ZoneInfo(str(local_tz))
    except Exception:
        pass
    return ZoneInfo("UTC")


def parse_deadline_datetime(
    due_date_raw: Any,
    tz: ZoneInfo,
) -> tuple[Optional[datetime], bool]:
    """Parse a due date into a timezone-aware datetime and a flag indicating if it was date-only.
    
    Returns (aware_dt, is_date_only).
    For date-only strings (e.g. '2026-10-20'), aware_dt is at 23:59:59.999 in the target timezone.
    """
    if not due_date_raw:
        return None, False

    if isinstance(due_date_raw, datetime):
        if due_date_raw.tzinfo is None:
            return due_date_raw.replace(tzinfo=tz), False
        return due_date_raw.astimezone(tz), False

    if isinstance(due_date_raw, date):
        dt = datetime.combine(due_date_raw, time(23, 59, 59, 999000), tzinfo=tz)
        return dt, True

    if not isinstance(due_date_raw, str):
        return None, False

    s = due_date_raw.strip()
    if not s:
        return None, False

    # Check date-only YYYY-MM-DD
    if len(s) == 10 and s[4] == "-" and s[7] == "-":
        try:
            d = date.fromisoformat(s)
            dt = datetime.combine(d, time(23, 59, 59, 999000), tzinfo=tz)
            return dt, True
        except ValueError:
            pass

    # Try ISO datetime parse
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=tz)
        else:
            dt = dt.astimezone(tz)
        return dt, False
    except ValueError:
        pass

    return None, False


def classify_deadline(
    task: Dict[str, Any],
    now: Optional[datetime] = None,
    user_tz_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Deterministically classify a task according to the 7 precedence rules."""
    tz = get_user_timezone(user_tz_name)
    current_time = now.astimezone(tz) if now else datetime.now(tz)
    current_date = current_time.date()

    # Dimension 1: Lifecycle Status
    raw_status = str(task.get("status") or "open").lower().strip()
    raw_countdown = str(task.get("countdown") or "").lower().strip()

    is_completed = raw_status in ("completed", "done") or raw_countdown == "completed"
    is_cancelled = raw_status in ("cancelled", "canceled")

    if is_completed:
        lifecycle = "completed"
    elif is_cancelled:
        lifecycle = "cancelled"
    elif raw_status == "in_progress":
        lifecycle = "in_progress"
    elif raw_status == "blocked":
        lifecycle = "blocked"
    else:
        lifecycle = "pending"

    # Dimension 3: Priority
    raw_priority = str(task.get("priority") or "medium").lower().strip()
    priority = raw_priority if raw_priority in ("urgent", "high", "medium", "low") else "medium"

    # Dimension 4: Data Origin
    task_id_str = str(task.get("id") or "")
    trusted_url = str(task.get("trusted_event_url") or "").lower()
    from backend.routers.tasks_verification import DEMO_TASK_TITLES
    is_demo = bool(
        task.get("is_demo")
        or task.get("is_fallback")
        or task_id_str.startswith(("demo-", "mock-", "sim-"))
        or "demo" in task.get("tags", [])
        or "demo" in trusted_url
        or (task.get("notes") and "demo persona" in str(task.get("notes")).lower())
        or str(task.get("title") or "").strip() in DEMO_TASK_TITLES
    )
    origin = "demo" if is_demo else "user"

    # Rule 1: Completed and cancelled tasks must not appear as active deadlines
    if is_completed:
        return {
            "lifecycle": lifecycle,
            "timing": "completed",
            "priority": priority,
            "origin": origin,
            "is_active_deadline": False,
            "is_overdue": False,
            "is_urgent": False,
            "diff_hours": 9999.0,
            "diff_days": 9999,
            "label": "Completed",
        }

    if is_cancelled:
        return {
            "lifecycle": lifecycle,
            "timing": "cancelled",
            "priority": priority,
            "origin": origin,
            "is_active_deadline": False,
            "is_overdue": False,
            "is_urgent": False,
            "diff_hours": 9999.0,
            "diff_days": 9999,
            "label": "Cancelled",
        }

    # Parse Deadline
    due_raw = task.get("due_date")
    due_dt, is_date_only = parse_deadline_datetime(due_raw, tz)

    # Rule 2: Active tasks without deadlines are no_deadline
    if not due_dt:
        return {
            "lifecycle": lifecycle,
            "timing": "no_deadline",
            "priority": priority,
            "origin": origin,
            "is_active_deadline": False,
            "is_overdue": False,
            "is_urgent": False,
            "diff_hours": 9999.0,
            "diff_days": 9999,
            "label": "No deadline",
        }

    # Mathematical differences
    diff_seconds = (due_dt - current_time).total_seconds()
    diff_hours = diff_seconds / 3600.0
    due_date_local = due_dt.date()
    diff_calendar_days = (due_date_local - current_date).days

    # Rule 3: Unfinished tasks whose actual deadline has passed are overdue
    # Date-only deadline: remains due_today throughout its local calendar day, transitions to overdue only after that calendar day ends.
    # Timestamp-based deadline: transitions to overdue when its actual deadline instant passes.
    if is_date_only:
        has_passed = due_date_local < current_date
    else:
        has_passed = diff_seconds < 0

    if has_passed:
        overdue_days = max(1, abs(diff_calendar_days))
        return {
            "lifecycle": lifecycle,
            "timing": "overdue",
            "priority": priority,
            "origin": origin,
            "is_active_deadline": True,
            "is_overdue": True,
            "is_urgent": True,
            "diff_hours": diff_hours,
            "diff_days": diff_calendar_days,
            "label": f"⚠️ Overdue ({overdue_days}d ago)",
        }

    # Rule 4: Future deadlines falling on the user's current local calendar day are due_today
    if due_date_local == current_date:
        return {
            "lifecycle": lifecycle,
            "timing": "due_today",
            "priority": priority,
            "origin": origin,
            "is_active_deadline": True,
            "is_overdue": False,
            "is_urgent": True,
            "diff_hours": diff_hours,
            "diff_days": 0,
            "label": "⚠️ Due today",
        }

    # Rule 5: Deadlines within the next 24 hours, outside the due_today category, are urgent
    if diff_hours <= 24.0:
        hours_int = max(1, int(round(diff_hours)))
        return {
            "lifecycle": lifecycle,
            "timing": "urgent",
            "priority": priority,
            "origin": origin,
            "is_active_deadline": True,
            "is_overdue": False,
            "is_urgent": True,
            "diff_hours": diff_hours,
            "diff_days": diff_calendar_days,
            "label": f"🚨 Due in {hours_int}h",
        }

    # Rule 6: Remaining deadlines within the next seven days are due_soon
    if diff_calendar_days <= 7:
        day_name = due_dt.strftime("%a")
        return {
            "lifecycle": lifecycle,
            "timing": "due_soon",
            "priority": priority,
            "origin": origin,
            "is_active_deadline": True,
            "is_overdue": False,
            "is_urgent": False,
            "diff_hours": diff_hours,
            "diff_days": diff_calendar_days,
            "label": f"{diff_calendar_days}d left ({day_name})",
        }

    # Rule 7: More distant future deadlines are upcoming
    return {
        "lifecycle": lifecycle,
        "timing": "upcoming",
        "priority": priority,
        "origin": origin,
        "is_active_deadline": True,
        "is_overdue": False,
        "is_urgent": False,
        "diff_hours": diff_hours,
        "diff_days": diff_calendar_days,
        "label": f"{diff_calendar_days}d left",
    }


def filter_tasks_by_view(
    tasks: List[Dict[str, Any]],
    view: str,
    now: Optional[datetime] = None,
    user_tz_name: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Filter task list by dashboard view category."""
    v = (view or "all").lower().strip()
    if v == "all":
        return list(tasks)

    results = []
    for t in tasks:
        c = classify_deadline(t, now=now, user_tz_name=user_tz_name)
        if v == "overdue" and c["timing"] == "overdue" and c["is_active_deadline"]:
            results.append(t)
        elif v == "due_today" and c["timing"] == "due_today" and c["is_active_deadline"]:
            results.append(t)
        elif v == "urgent" and c["timing"] == "urgent" and c["is_active_deadline"]:
            results.append(t)
        elif v == "due_soon" and c["timing"] == "due_soon" and c["is_active_deadline"]:
            results.append(t)
        elif v == "upcoming" and c["timing"] == "upcoming" and c["is_active_deadline"]:
            results.append(t)
        elif v in ("pending", "pending_tasks") and c["lifecycle"] == "pending":
            results.append(t)
        elif v in ("in_progress", "inprogress") and c["lifecycle"] == "in_progress":
            results.append(t)
        elif v in ("completed", "done") and c["lifecycle"] == "completed":
            results.append(t)
        elif v == "blocked" and c["lifecycle"] == "blocked":
            results.append(t)
        elif v in ("cancelled", "canceled") and c["lifecycle"] == "cancelled":
            results.append(t)

    return results
