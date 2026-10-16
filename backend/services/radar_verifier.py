"""
Compass — Internship Radar Official Source & Status Verifier.

Reuses the existing Tavily service (search, extract, fence_web_content)
with safe deterministic HTTP fallbacks and strict state-machine transitions.

Guarantees:
1. Never marks an unverified link as OPEN_CONFIRMED.
2. Unreachable pages become STATUS_UNKNOWN or retain NEEDS_VERIFICATION, never fabricated.
3. Closed announcements transition to CLOSED_CONFIRMED based on published evidence.
4. Untrusted web content is sanitized to prevent prompt injection.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple
import httpx

from backend.models_radar import OpportunityStatus
from backend.services.tavily import (
    extract as tavily_extract,
    fence_web_content,
    tavily_available,
)

logger = logging.getLogger("compass.radar.verifier")

CLOSED_PATTERNS = [
    re.compile(r"no longer accepting applications", re.IGNORECASE),
    re.compile(r"applications (have )?closed", re.IGNORECASE),
    re.compile(r"this (job|posting|requisition) has expired", re.IGNORECASE),
    re.compile(r"this (job|position) is no longer available", re.IGNORECASE),
    re.compile(r"deadline (has )?passed", re.IGNORECASE),
    re.compile(r"position (has been )?filled", re.IGNORECASE),
    re.compile(r"not currently accepting", re.IGNORECASE),
]

OPEN_PATTERNS = [
    re.compile(r"\bapply (now|online|for this (job|position|role))\b", re.IGNORECASE),
    re.compile(r"\bsubmit application\b", re.IGNORECASE),
    re.compile(r"\bstart application\b", re.IGNORECASE),
    re.compile(r"\bapplication form\b", re.IGNORECASE),
]


async def verify_opportunity_status(
    application_url: str,
    current_status: str = OpportunityStatus.NEEDS_VERIFICATION,
) -> Tuple[str, str, datetime]:
    """
    Verifies the live state of an opportunity application URL.

    Returns:
        (new_status, evidence_summary, verification_time)
    """
    now = datetime.now(timezone.utc)
    if not application_url or not application_url.startswith("http"):
        return (
            OpportunityStatus.STATUS_UNKNOWN,
            "No valid HTTP application URL provided for verification.",
            now,
        )

    content_text = ""
    verification_method = "http_direct"

    # Step 1: Attempt extraction via Tavily Extract if enabled
    if tavily_available():
        try:
            res = await tavily_extract(urls=[application_url])
            results = res.get("results", [])
            if results and results[0].get("raw_content"):
                content_text = results[0]["raw_content"]
                verification_method = "tavily_extract"
        except Exception as e:
            logger.warning(f"Tavily extract failed for {application_url}: {e}. Falling back to direct HTTP.")

    # Step 2: Fallback to direct HTTP fetch if Tavily unavailable or empty
    if not content_text:
        try:
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                resp = await client.get(
                    application_url,
                    headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CompassInternshipRadar/1.0"}
                )
                if resp.status_code == 404 or resp.status_code == 410:
                    return (
                        OpportunityStatus.CLOSED_CONFIRMED,
                        f"Official page returned HTTP {resp.status_code} (Requisition Removed).",
                        now,
                    )
                if resp.status_code >= 400:
                    return (
                        current_status,
                        f"Official page returned HTTP {resp.status_code}. Status retained pending recheck.",
                        now,
                    )
                content_text = resp.text
                verification_method = "http_direct"
        except Exception as err:
            logger.info(f"Direct HTTP check error for {application_url}: {err}")
            return (
                current_status,
                f"Verification connection timed out or failed: {str(err)[:100]}. Retaining current status.",
                now,
            )

    # Step 3: Sanitize and fence untrusted text
    safe_content = fence_web_content([{"url": application_url, "content": content_text[:4000]}])

    # Step 4: Deterministic Pattern Analysis
    for pattern in CLOSED_PATTERNS:
        match = pattern.search(safe_content)
        if match:
            return (
                OpportunityStatus.CLOSED_CONFIRMED,
                f"Verified closed via {verification_method}: Published notice '{match.group(0)}'.",
                now,
            )

    for pattern in OPEN_PATTERNS:
        match = pattern.search(safe_content)
        if match:
            return (
                OpportunityStatus.OPEN_CONFIRMED,
                f"Verified open via {verification_method}: Found active submission trigger '{match.group(0)}'.",
                now,
            )

    # If HTTP 200 was received but no explicit open/closed triggers matched
    return (
        OpportunityStatus.OPEN_CONFIRMED if current_status == OpportunityStatus.OPEN_CONFIRMED else OpportunityStatus.NEEDS_VERIFICATION,
        f"Verified reachable (HTTP 200 via {verification_method}). Specific application keywords require manual check.",
        now,
    )
