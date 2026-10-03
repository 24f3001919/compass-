"""
Compass — Tavily Deadline Verification & Schedule Drift Analysis.

Audits stored task deadlines against live web results to detect schedule shifts,
extensions, or discrepancies with official hackathon, conference, or coursework dates.
"""

from __future__ import annotations

import datetime
from datetime import date
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from backend.services.tavily_authority import classify_domain_authority

logger = logging.getLogger("compass.services.tavily_deadline")

MONTHS = (
    r"(?:January|February|March|April|May|June|July|August|September|October|November|December|"
    r"Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)"
)
DATE_PATTERN = re.compile(
    rf"\b({MONTHS}\s+\d{{1,2}}(?:st|nd|rd|th)?(?:,?\s+\d{{4}})?|\d{{4}}-\d{{2}}-\d{{2}})\b",
    re.IGNORECASE,
)


def parse_date_candidate(text: str) -> Optional[date]:
    """Parse standard date candidate strings."""
    clean = re.sub(r"(\d+)(st|nd|rd|th)", r"\1", text.strip())
    clean = clean.replace(",", " ")
    clean = " ".join(clean.split())
    for fmt in ("%B %d %Y", "%b %d %Y", "%Y-%m-%d"):
        try:
            return datetime.datetime.strptime(clean, fmt).date()
        except ValueError:
            continue
    return None


def extract_dates_from_results(
    results: List[Dict[str, Any]],
    default_year: int = 2026,
) -> List[Dict[str, Any]]:
    """Extract candidate dates from search snippets and classify by source authority."""
    extracted = []
    seen = set()

    for r in results:
        url = r.get("url") or ""
        content = f"{r.get('title', '')} {r.get('content', '')}"
        auth = classify_domain_authority(url)
        matches = DATE_PATTERN.findall(content)

        for raw_match in matches:
            match_str = raw_match
            if not re.search(r"\d{4}", match_str):
                match_str = f"{match_str}, {default_year}"

            parsed = parse_date_candidate(match_str)
            if parsed:
                key = (parsed.isoformat(), url)
                if key not in seen:
                    seen.add(key)
                    # Extract surrounding sentence as evidence
                    snippet = (r.get("content") or "")[:350].strip()
                    extracted.append({
                        "date": parsed,
                        "date_str": parsed.isoformat(),
                        "raw_match": raw_match,
                        "url": url,
                        "domain": auth.get("domain", ""),
                        "authority_tier": auth.get("tier", "tier_3_general"),
                        "authority_badge": auth.get("badge", "Web"),
                        "authority_weight": auth.get("weight", 0.5),
                        "snippet": snippet,
                    })

    # Sort candidates by source authority weight first, then by earliest date
    extracted.sort(key=lambda x: (x["authority_weight"], x["date"]), reverse=True)
    return extracted


def analyze_deadline_drift(
    stored_due_str: Optional[str],
    results: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Compare a stored due date with live web evidence to determine the drift verdict.

    Possible verdicts:
      - VERIFIED: Exact match between stored date and official source.
      - CHANGED: Official date differs from stored date.
      - CONFLICTING: Multiple authoritative sources disagree.
      - NOT_FOUND: No date found in search results.
      - STALE: Stored date has passed and cannot be verified.
      - UNVERIFIED: Ambiguous or low-confidence evidence.
    """
    stored_date: Optional[date] = None
    if stored_due_str and stored_due_str not in ("none", "None", ""):
        try:
            stored_date = date.fromisoformat(stored_due_str[:10])
        except Exception:
            pass

    default_year = stored_date.year if stored_date else 2026
    candidates = extract_dates_from_results(results, default_year=default_year)

    if not candidates:
        verdict = "NOT_FOUND"
        if stored_date and stored_date < date.today():
            verdict = "STALE"
        return {
            "verdict": verdict,
            "drift_verdict": "UNVERIFIED_AMBIGUOUS",
            "has_drift": False,
            "stored_date": stored_date.isoformat() if stored_date else None,
            "live_date": None,
            "drift_days": 0,
            "direction": "not_found",
            "source_url": None,
            "source_authority": None,
            "evidence": None,
            "candidates_found": 0,
            "recommendation": "No deadline dates detected in web results. Retain existing schedule.",
        }

    # Separate candidates by authority tier
    tier1_candidates = [c for c in candidates if c["authority_tier"] == "tier_1_official"]
    primary_pool = tier1_candidates if tier1_candidates else candidates

    # If the announcement mentions the stored date and an updated date, filter out the stored date
    distinct_dates = {c["date"] for c in primary_pool}
    new_dates = {d for d in distinct_dates if d != stored_date}
    if stored_date and new_dates and len(new_dates) == 1:
        primary_pool = [c for c in primary_pool if c["date"] != stored_date]
        distinct_dates = new_dates
    elif len(distinct_dates) > 1 and len(primary_pool) >= 2:
        return {
            "verdict": "CONFLICTING",
            "drift_verdict": "CONFLICTING",
            "has_drift": True,
            "stored_date": stored_date.isoformat() if stored_date else None,
            "live_date": primary_pool[0]["date_str"],
            "drift_days": (primary_pool[0]["date"] - stored_date).days if stored_date else 0,
            "direction": "conflicting_sources",
            "source_url": primary_pool[0]["url"],
            "source_authority": primary_pool[0]["authority_badge"],
            "evidence": f"Multiple sources reported differing dates: {', '.join(d.isoformat() for d in distinct_dates)}",
            "candidates_found": len(candidates),
            "recommendation": "Conflicting dates found across sources. Manual user review recommended.",
        }

    top_candidate = primary_pool[0]
    detected_date = top_candidate["date"]

    if not stored_date:
        return {
            "verdict": "UNVERIFIED",
            "drift_verdict": "UNVERIFIED_AMBIGUOUS",
            "has_drift": False,
            "stored_date": None,
            "live_date": detected_date.isoformat(),
            "drift_days": 0,
            "direction": "new_date_discovered",
            "source_url": top_candidate["url"],
            "source_authority": top_candidate["authority_badge"],
            "evidence": top_candidate["snippet"],
            "candidates_found": len(candidates),
            "recommendation": f"Official source mentions {detected_date.isoformat()}. Assign as deadline?",
        }

    drift_days = (detected_date - stored_date).days
    has_drift = drift_days != 0

    if not has_drift:
        verdict = "VERIFIED"
        drift_verdict = "CONFIRMED_ACCURATE"
        direction = "confirmed matching"
        recommendation = "Stored deadline is verified accurate against official sources."
    else:
        verdict = "CHANGED"
        drift_verdict = "SCHEDULE_DRIFT"
        direction = "postponed / extended" if drift_days > 0 else "moved earlier"
        recommendation = (
            f"Official source indicates deadline is {detected_date.isoformat()} "
            f"({direction} by {abs(drift_days)} days). Update schedule recommended."
        )

    return {
        "verdict": verdict,
        "drift_verdict": drift_verdict,
        "has_drift": has_drift,
        "stored_date": stored_date.isoformat(),
        "live_date": detected_date.isoformat(),
        "drift_days": drift_days,
        "direction": direction,
        "source_url": top_candidate["url"],
        "source_authority": top_candidate["authority_badge"],
        "evidence": top_candidate["snippet"],
        "candidates_found": len(candidates),
        "recommendation": recommendation,
    }
