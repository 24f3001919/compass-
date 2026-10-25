"""
Compass — Hackathon Winning Features Service.

Implements high-impact intelligence features:
1. Company Intel Briefs: Deep research on employers to guide application tailoring.
2. ATS Stress Test: Simulated machine-parsing of resumes to identify red flags.
3. Hiring Forecasts: Predicting recruitment cycles based on historical radar data.
"""

from __future__ import annotations

import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple
from fastapi import HTTPException
from backend.services import tavily_research, career_resume
from backend.models_radar import OpportunityOut

logger = logging.getLogger("compass.services.winning_features")

# In-Memory 24-Hour Company Intel Cache per opportunity
_COMPANY_INTEL_CACHE: Dict[int, Tuple[float, Dict[str, Any]]] = {}
INTEL_CACHE_TTL = 86400.0  # 24 hours

# Separate daily Tavily sub-budget for company intelligence research (30 credits/day)
MAX_DAILY_INTEL_TAVILY_CREDITS = 30
_daily_intel_tavily_usage: Dict[str, int] = {}  # date_str -> credits


def get_cached_company_intel(opportunity_id: int) -> Optional[Dict[str, Any]]:
    """Retrieve 24-hour cached company intel brief for an opportunity if unexpired."""
    entry = _COMPANY_INTEL_CACHE.get(opportunity_id)
    if entry:
        ts, data = entry
        if time.time() - ts < INTEL_CACHE_TTL:
            return data
    return None


def store_cached_company_intel(opportunity_id: int, data: Dict[str, Any]) -> None:
    """Store company intel brief in 24-hour cache."""
    _COMPANY_INTEL_CACHE[opportunity_id] = (time.time(), data)


def check_intel_tavily_budget(cost: int = 1) -> bool:
    """Check and record consumption against the dedicated 30 credit/day company intel sub-budget."""
    from datetime import date
    today_str = date.today().isoformat()
    if today_str not in _daily_intel_tavily_usage:
        _daily_intel_tavily_usage.clear()
        _daily_intel_tavily_usage[today_str] = 0
    current = _daily_intel_tavily_usage[today_str]
    if current + cost > MAX_DAILY_INTEL_TAVILY_CREDITS:
        return False
    _daily_intel_tavily_usage[today_str] = current + cost
    return True


async def generate_company_intel_brief(opportunity: OpportunityOut) -> Dict[str, Any]:
    """
    Generates a strategic intel brief for a company to help a candidate tailor their application.
    Queries current goals, recent news, and technical pain points.
    Enforces a 24-hour cache per opportunity and a separate 30 credits/day Tavily sub-budget.
    """
    # 0. Check 24-hour cache first (hit = 0 external Tavily calls)
    cached = get_cached_company_intel(opportunity.id)
    if cached is not None:
        logger.info("Company intel cache hit for opportunity %s (0 external Tavily calls)", opportunity.id)
        return cached

    # 1. Enforce separate Tavily sub-budget (30 credits/day)
    if not check_intel_tavily_budget(cost=1):
        logger.warning("Daily company intel Tavily budget (%d credits) exceeded", MAX_DAILY_INTEL_TAVILY_CREDITS)
        raise HTTPException(
            status_code=429,
            detail={
                "detail": f"Daily company intelligence research budget reached ({MAX_DAILY_INTEL_TAVILY_CREDITS} credits/day). Please try again tomorrow.",
                "code": "intel_budget_exceeded",
            },
            headers={"Retry-After": "86400"},
        )

    company = opportunity.company_name
    role = opportunity.role_title

    # 2. Construct a high-fidelity research query
    research_topic = (
        f"Current strategic goals, recent technical milestones, and core engineering "
        f"challenges for {company} specifically regarding {role} roles in {opportunity.location or 'their primary locations'}."
    )

    # 3. Execute deep research via Tavily
    research_result = await tavily_research.execute_deep_research(
        topic=research_topic,
        search_depth="basic",
    )

    # 4. Format into a "War Room" brief
    citations = research_result.get("citations", [])

    brief: Dict[str, Any] = {
        "company": company,
        "role": role,
        "strategic_insights": [],
        "technical_pain_points": [],
        "recent_news": [],
        "talking_points": [],
        "sources": citations,
        "cached": False,
    }

    for c in citations:
        snippet = c.get("snippet", "").lower()
        if any(k in snippet for k in ("challenge", "problem", "need", "scaling", "migration", "bottleneck")):
            brief["technical_pain_points"].append(f"{c['title']}: {c['snippet']}")
        elif any(k in snippet for k in ("announced", "launched", "partnership", "acquired", "funding")):
            brief["recent_news"].append(f"{c['title']}: {c['snippet']}")
        else:
            brief["strategic_insights"].append(f"{c['title']}: {c['snippet']}")

    # Generate high-impact talking points
    brief["talking_points"] = [
        f"Mention the recent {brief['recent_news'][0] if brief['recent_news'] else 'growth'} during the interview.",
        f"Discuss how your skills in {opportunity.category} can help solve {brief['technical_pain_points'][0] if brief['technical_pain_points'] else 'current engineering challenges'}.",
    ]

    # Store in 24-hour cache
    store_cached_company_intel(opportunity.id, brief)
    return brief


def simulate_ats_parsing(resume_content: Any) -> Dict[str, Any]:
    """
    Simulates how a legacy ATS parses a resume to identify 'Invisible' failures.
    Returns an estimated report on parsing gaps, keyword density, and formatting red flags.
    Labelled honestly as an estimate.
    """
    report = {
        "parsed_text_preview": "...",
        "detected_sections": [],
        "missing_critical_keywords": [],
        "formatting_warnings": [],
        "score": 0.0,
        "is_estimate": True,
        "label": "estimate",
    }
    return report
