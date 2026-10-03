"""
Compass — Operational & Abuse Budgets.

Enforces per-run and per-day computational, tool, and search credit limits.
Fails gracefully with clear user-facing messages.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional
from fastapi import HTTPException

from backend.memory.db import get_pool

logger = logging.getLogger("compass.budgets")

# Per-Run Budgets
MAX_RUN_MODEL_CALLS = 15
MAX_RUN_TOOL_CALLS = 20
MAX_RUN_TAVILY_CREDITS = 6

# Per-Day Budgets
MAX_DAILY_USER_MODEL_CALLS = 150
MAX_DAILY_GUEST_MODEL_CALLS = 40
MAX_DAILY_USER_TAVILY_CREDITS = 30
MAX_DAILY_GUEST_TAVILY_CREDITS = 8


class BudgetExceededError(Exception):
    """Raised when an execution or daily budget is exceeded."""
    def __init__(self, message: str, budget_type: str, limit: int, current: int):
        super().__init__(message)
        self.budget_type = budget_type
        self.limit = limit
        self.current = current


def check_run_limits(model_calls: int, tool_calls: int, tavily_credits: int) -> None:
    """Validate that the active agent run has not exceeded per-run budget limits."""
    if model_calls > MAX_RUN_MODEL_CALLS:
        raise BudgetExceededError(
            f"Per-run model call budget exceeded ({model_calls}/{MAX_RUN_MODEL_CALLS}). Run terminated gracefully.",
            "model_calls",
            MAX_RUN_MODEL_CALLS,
            model_calls,
        )
    if tool_calls > MAX_RUN_TOOL_CALLS:
        raise BudgetExceededError(
            f"Per-run tool call budget exceeded ({tool_calls}/{MAX_RUN_TOOL_CALLS}). Run terminated gracefully.",
            "tool_calls",
            MAX_RUN_TOOL_CALLS,
            tool_calls,
        )
    if tavily_credits > MAX_RUN_TAVILY_CREDITS:
        raise BudgetExceededError(
            f"Per-run Tavily search credit budget exceeded ({tavily_credits}/{MAX_RUN_TAVILY_CREDITS}). Search capped gracefully.",
            "tavily_credits",
            MAX_RUN_TAVILY_CREDITS,
            tavily_credits,
        )


async def check_daily_identity_budget(
    user_id: Optional[str] = None,
    guest_id: Optional[str] = None,
) -> None:
    """Check identity's daily consumption against per-day limits.
    
    Raises HTTPException(429) if daily threshold is reached.
    """
    is_guest = bool(not user_id or (guest_id and not user_id))
    max_model_calls = MAX_DAILY_GUEST_MODEL_CALLS if is_guest else MAX_DAILY_USER_MODEL_CALLS
    max_tavily = MAX_DAILY_GUEST_TAVILY_CREDITS if is_guest else MAX_DAILY_USER_TAVILY_CREDITS

    try:
        pool = await get_pool()
        if pool:
            async with pool.acquire() as conn:
                # Count today's tavily credits
                tav_credits = await conn.fetchval(
                    """
                    SELECT COALESCE(SUM(credits), 0)
                    FROM tavily_usage_log
                    WHERE created_at >= date_trunc('day', now())
                    """
                ) or 0

                if int(tav_credits) >= max_tavily:
                    identity_label = "guest session" if is_guest else "user account"
                    raise HTTPException(
                        status_code=429,
                        detail=f"Daily Tavily search credit budget of {max_tavily} credits reached for this {identity_label}. Please try again tomorrow.",
                    )
    except HTTPException:
        raise
    except Exception as e:
        logger.debug(f"Could not verify daily budget against DB: {e}")
