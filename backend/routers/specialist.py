"""
Compass — Specialist Multi-Agent Dispatch Router.
"""

from fastapi import APIRouter, Depends
from backend.dependencies import rate_limit
from backend.memory.db import get_pool

router = APIRouter(tags=["specialist"])


@router.post("/api/specialist/dispatch", dependencies=[Depends(rate_limit)])
async def dispatch_specialist_endpoint(request_data: dict):
    """Direct thin API endpoint for the Specialist Multi-Agent System UI.
    Validates request -> delegates to SpecialistDispatcher -> returns structured SpecialistResult.
    """
    from backend.agents.specialist import SpecialistRequest, SpecialistDispatcher
    pool = await get_pool()

    capability = request_data.get("capability", "memory")
    user_goal = request_data.get("user_goal") or request_data.get("goal") or ""
    relevant_context = request_data.get("relevant_context")
    allowed_tools = request_data.get("allowed_tools")

    req_cap = capability.lower().strip() if isinstance(capability, str) else "memory"
    if req_cap not in ("coursework", "research", "calendar", "memory"):
        req_cap = "memory"

    spec_req = SpecialistRequest(
        capability=req_cap,  # type: ignore
        user_goal=user_goal,
        relevant_context=relevant_context,
        allowed_tools=allowed_tools,
    )
    result = await SpecialistDispatcher.dispatch(spec_req, pool=pool)
    return result.model_dump()
