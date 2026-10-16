"""
Compass — Internship Radar API Router.

Provides authenticated endpoints for opportunity discovery, eligibility matching,
watchlist monitoring, application pipeline tracking, and source synchronization.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from backend.dependencies import _get_or_create_user_id
from backend.memory.radar import (
    add_status_history,
    delete_user_saved_opportunity,
    get_all_opportunities,
    get_last_sync_run,
    get_opportunity_by_id,
    get_radar_overview_stats,
    get_user_application_tracking,
    get_user_opportunity_profile,
    get_user_saved_opportunities,
    update_opportunity_status,
    upsert_user_application_status,
    upsert_user_opportunity_profile,
    upsert_user_saved_opportunity,
)
from backend.models_radar import (
    EligibilityClassification,
    OpportunitiesListResponse,
    OpportunityOut,
    OpportunityOverviewStats,
    OpportunityStatus,
    UpdateApplicationStatusIn,
    UserOpportunityProfileIn,
    UserOpportunityProfileOut,
)
from backend.services.radar_eligibility import evaluate_eligibility
from backend.services.radar_prediction import estimate_recruitment_cycle
from backend.services.radar_sync import run_radar_sync
from backend.services.radar_verifier import verify_opportunity_status

logger = logging.getLogger("compass.routers.radar")

router = APIRouter(prefix="/api/opportunities", tags=["internship_radar"])


def _enrich_opportunity(opp: OpportunityOut, profile: Optional[UserOpportunityProfileIn]) -> OpportunityOut:
    """Enriches an opportunity with predictive cycle estimates and personal eligibility."""
    # Compute historical prediction
    opp.prediction = estimate_recruitment_cycle(opp.cycles)

    # Compute personal eligibility
    cls, explanation, reasons = evaluate_eligibility(opp, profile)
    opp.eligibility_classification = cls
    opp.eligibility_explanation = explanation
    opp.eligibility_reasons = reasons
    return opp


@router.get("", response_model=OpportunitiesListResponse)
async def list_opportunities_endpoint(
    request: Request,
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    work_arrangement: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    india_only: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """List opportunities with pagination, filtering, and deterministic personal eligibility assessment."""
    user_id = _get_or_create_user_id(request)
    profile = await get_user_opportunity_profile(user_id)

    raw_items, total = await get_all_opportunities(
        user_id=user_id,
        status=status,
        category=category,
        work_arrangement=work_arrangement,
        country=country,
        search=search,
        india_only=india_only,
        page=page,
        page_size=page_size,
    )

    enriched = [_enrich_opportunity(item, profile) for item in raw_items]
    return OpportunitiesListResponse(
        opportunities=enriched,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.get("/recommended", response_model=List[OpportunityOut])
async def get_recommended_opportunities(request: Request, limit: int = Query(20, ge=1, le=50)):
    """Return top recommended opportunities tailored to user's profile and preferences."""
    user_id = _get_or_create_user_id(request)
    profile = await get_user_opportunity_profile(user_id)

    raw_items, _ = await get_all_opportunities(
        user_id=user_id,
        page=1,
        page_size=100,  # Evaluate top 100 for ranking
    )

    enriched = [_enrich_opportunity(item, profile) for item in raw_items]

    # Deterministic Ranking Matrix:
    # 1. ELIGIBLE + OPEN_CONFIRMED
    # 2. POTENTIAL_MATCH + OPEN_CONFIRMED
    # 3. ELIGIBLE + UPCOMING_CONFIRMED
    # 4. POTENTIAL_MATCH + UPCOMING_CONFIRMED
    # 5. Others
    def rank_key(o: OpportunityOut) -> tuple:
        status_weight = 0 if o.current_status == OpportunityStatus.OPEN_CONFIRMED else (
            1 if o.current_status == OpportunityStatus.UPCOMING_CONFIRMED else 2
        )
        eligibility_weight = {
            EligibilityClassification.ELIGIBLE: 0,
            EligibilityClassification.POTENTIAL_MATCH: 1,
            EligibilityClassification.INSUFFICIENT_INFORMATION: 2,
            EligibilityClassification.INELIGIBLE: 3,
        }.get(o.eligibility_classification, 2)
        india_bonus = 0 if o.is_india_eligible else 1
        return (eligibility_weight, status_weight, india_bonus)

    enriched.sort(key=rank_key)
    return enriched[:limit]


@router.get("/open", response_model=List[OpportunityOut])
async def get_open_confirmed_opportunities(
    request: Request,
    category: Optional[str] = Query(None),
    work_arrangement: Optional[str] = Query(None),
    india_only: bool = Query(True),
):
    """Return strictly verified open opportunities."""
    user_id = _get_or_create_user_id(request)
    profile = await get_user_opportunity_profile(user_id)

    raw_items, _ = await get_all_opportunities(
        user_id=user_id,
        status=OpportunityStatus.OPEN_CONFIRMED,
        category=category,
        work_arrangement=work_arrangement,
        india_only=india_only,
        page=1,
        page_size=50,
    )
    return [_enrich_opportunity(item, profile) for item in raw_items]


@router.get("/upcoming", response_model=List[OpportunityOut])
async def get_upcoming_opportunities(request: Request):
    """Return confirmed future openings and opportunities with reliable recruitment cycle estimates."""
    user_id = _get_or_create_user_id(request)
    profile = await get_user_opportunity_profile(user_id)

    raw_items, _ = await get_all_opportunities(user_id=user_id, page=1, page_size=100)
    enriched = [_enrich_opportunity(item, profile) for item in raw_items]

    # Filter items that are either UPCOMING_CONFIRMED or have non-empty prediction
    upcoming = [
        item for item in enriched
        if item.current_status in {OpportunityStatus.UPCOMING_CONFIRMED, OpportunityStatus.ANNOUNCED}
        or (item.prediction and item.prediction.estimated_open_window is not None)
    ]
    return upcoming


@router.get("/analytics", response_model=OpportunityOverviewStats)
async def get_radar_analytics_endpoint(request: Request):
    """Return live dashboard statistics computed from real database records and user profile."""
    user_id = _get_or_create_user_id(request)
    stats_dict = await get_radar_overview_stats(user_id)
    return OpportunityOverviewStats(**stats_dict)


@router.get("/watchlist", response_model=List[OpportunityOut])
async def get_watchlist_endpoint(request: Request):
    """Return opportunities saved to the authenticated user's watchlist."""
    user_id = _get_or_create_user_id(request)
    profile = await get_user_opportunity_profile(user_id)
    saved = await get_user_saved_opportunities(user_id)
    return [_enrich_opportunity(item, profile) for item in saved]


@router.post("/{opportunity_id}/save")
async def save_opportunity_endpoint(opportunity_id: int, request: Request):
    """Save an opportunity to user watchlist."""
    user_id = _get_or_create_user_id(request)
    await upsert_user_saved_opportunity(user_id, opportunity_id, is_saved=True)
    return {"status": "ok", "saved": True, "opportunity_id": opportunity_id}


@router.delete("/{opportunity_id}/save")
async def unsave_opportunity_endpoint(opportunity_id: int, request: Request):
    """Remove an opportunity from user watchlist."""
    user_id = _get_or_create_user_id(request)
    await delete_user_saved_opportunity(user_id, opportunity_id)
    return {"status": "ok", "saved": False, "opportunity_id": opportunity_id}


@router.get("/applications", response_model=List[OpportunityOut])
async def get_applications_endpoint(request: Request):
    """List all tracked applications for the authenticated user."""
    user_id = _get_or_create_user_id(request)
    profile = await get_user_opportunity_profile(user_id)
    apps = await get_user_application_tracking(user_id)
    return [_enrich_opportunity(item, profile) for item in apps]


@router.post("/{opportunity_id}/application")
@router.patch("/{opportunity_id}/application")
async def update_application_status_endpoint(
    opportunity_id: int,
    body: UpdateApplicationStatusIn,
    request: Request,
):
    """Update application tracking status, deadlines, and private notes."""
    user_id = _get_or_create_user_id(request)
    await upsert_user_application_status(
        user_id=user_id,
        opportunity_id=opportunity_id,
        status=body.application_status,
        app_date=body.application_date,
        personal_deadline=body.personal_deadline,
        notes=body.private_notes,
    )
    return {"status": "ok", "opportunity_id": opportunity_id, "application_status": body.application_status}


@router.get("/profile", response_model=UserOpportunityProfileOut)
async def get_profile_endpoint(request: Request):
    """Retrieve personal opportunity matching profile."""
    user_id = _get_or_create_user_id(request)
    profile = await get_user_opportunity_profile(user_id)
    if not profile:
        profile = UserOpportunityProfileIn()

    missing = []
    if profile.academic_year is None:
        missing.append("academic_year")
    if profile.grad_year is None:
        missing.append("grad_year")
    if not profile.degree:
        missing.append("degree")
    if not profile.skills:
        missing.append("skills")

    return UserOpportunityProfileOut(
        user_id=user_id,
        **profile.model_dump(),
        missing_fields_limiting_eligibility=missing,
    )


@router.put("/profile", response_model=UserOpportunityProfileOut)
async def update_profile_endpoint(body: UserOpportunityProfileIn, request: Request):
    """Create or update personal opportunity matching profile."""
    user_id = _get_or_create_user_id(request)
    await upsert_user_opportunity_profile(user_id, body)
    return await get_profile_endpoint(request)


@router.post("/sync")
async def trigger_sync_endpoint(source: Optional[str] = Query(None)):
    """Trigger an on-demand source discovery and verification synchronization run."""
    res = await run_radar_sync(source_filter=source)
    return res


@router.get("/sync/status")
async def get_sync_status_endpoint():
    """Check status of last synchronization run."""
    last_run = await get_last_sync_run()
    return {"last_run": last_run}


@router.post("/{opportunity_id}/verify")
async def recheck_opportunity_status_endpoint(opportunity_id: int):
    """Perform real-time official source verification on a single opportunity."""
    opp = await get_opportunity_by_id(opportunity_id)
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    target_url = opp.official_application_url or opp.canonical_url
    new_status, evidence, verified_at = await verify_opportunity_status(target_url, opp.current_status)

    if new_status != opp.current_status:
        await update_opportunity_status(opportunity_id, new_status, verified_at)
        await add_status_history(
            opportunity_id=opportunity_id,
            prev_status=opp.current_status,
            new_status=new_status,
            evidence_source=target_url,
            reason=evidence,
        )

    return {
        "opportunity_id": opportunity_id,
        "previous_status": opp.current_status,
        "current_status": new_status,
        "evidence": evidence,
        "last_verified_at": verified_at.isoformat(),
    }


@router.get("/{opportunity_id}", response_model=OpportunityOut)
async def get_opportunity_detail_endpoint(opportunity_id: int, request: Request):
    """Retrieve complete opportunity details with sources, cycles, predictions, and eligibility evidence."""
    user_id = _get_or_create_user_id(request)
    opp = await get_opportunity_by_id(opportunity_id, user_id=user_id)
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")

    profile = await get_user_opportunity_profile(user_id)
    return _enrich_opportunity(opp, profile)
