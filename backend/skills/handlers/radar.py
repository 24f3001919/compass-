"""
Compass — Internship Radar AI Skill Handler.

Grounds AI queries about internships, research programs, deadlines, and eligibility
against verified records stored in the database.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from backend.memory.radar import get_all_opportunities, get_user_opportunity_profile
from backend.models_radar import OpportunityOut
from backend.services.radar_eligibility import evaluate_eligibility
from backend.services.radar_prediction import estimate_recruitment_cycle
from backend.skills.registry import register_skill

logger = logging.getLogger("compass.skills.radar")


@register_skill("query_internship_radar")
async def handle_query_internship_radar(args: Dict[str, Any], pool: Any = None) -> Dict[str, Any]:
    """
    Search and retrieve grounded internship and research opportunities from the database.
    """
    query = args.get("query")
    category = args.get("category")
    status = args.get("status")
    india_only = args.get("india_only", True)
    limit = min(int(args.get("limit", 10)), 20)
    user_id = args.get("user_id", "default_user")

    profile = await get_user_opportunity_profile(user_id)

    raw_items, total = await get_all_opportunities(
        user_id=user_id,
        status=status,
        category=category,
        search=query,
        india_only=india_only,
        page=1,
        page_size=limit,
    )

    results = []
    lines = []
    for item in raw_items:
        item.prediction = estimate_recruitment_cycle(item.cycles)
        cls, explanation, _ = evaluate_eligibility(item, profile)
        item.eligibility_classification = cls
        item.eligibility_explanation = explanation

        results.append({
            "id": item.id,
            "company": item.company_name,
            "role": item.role_title,
            "category": item.category,
            "status": item.current_status,
            "location": item.location,
            "work_arrangement": item.work_arrangement,
            "compensation": item.compensation,
            "application_url": item.official_application_url,
            "last_verified_at": item.last_verified_at.isoformat() if item.last_verified_at else None,
            "eligibility": cls,
            "eligibility_explanation": explanation,
            "predicted_window": item.prediction.estimated_open_window if item.prediction else None,
            "prediction_confidence": item.prediction.confidence if item.prediction else None,
        })
        lines.append(
            f"• **{item.company_name}** — {item.role_title} ({item.current_status.replace('_', ' ')})\n"
            f"  - Location: {item.location or 'India/Remote'} | Match: `{cls}`\n"
            f"  - Official Link: {item.official_application_url or 'N/A'}"
        )

    if not results:
        msg = "No verified opportunities currently matching your search query in the database. You can trigger a radar synchronization to discover new listings."
        return {
            "success": True,
            "data": {"count": 0, "opportunities": []},
            "summary": msg,
            "response": msg,
        }

    formatted_summary = f"Found {len(results)} verified opportunities in Compass Internship Radar:\n\n" + "\n\n".join(lines)
    return {
        "success": True,
        "data": {"count": len(results), "total_matching": total, "opportunities": results},
        "summary": formatted_summary,
        "response": formatted_summary,
    }
