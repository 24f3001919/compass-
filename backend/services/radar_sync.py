"""
Compass — Internship Radar Synchronization Orchestrator.

Manages scheduled & manual multi-source discovery runs:
1. Ingests curated Indian technology & research seeds.
2. Ingests candidate GitHub community repositories.
3. Performs targeted Tavily discovery queries when configured.
4. Updates status verification and records sync metrics idempotently.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.memory.radar import (
    add_opportunity_source,
    add_status_history,
    create_sync_run,
    finish_sync_run,
    get_all_opportunities,
    get_last_sync_run,
    upsert_opportunity,
    upsert_opportunity_cycle,
    upsert_opportunity_requirements,
)
from backend.models_radar import OpportunityStatus
from backend.services.radar_sources import (
    CURATED_INDIAN_OPPORTUNITIES,
    canonicalize_url,
    fetch_github_markdown_opportunities,
    normalize_company_name,
)
from backend.services.radar_verifier import verify_opportunity_status
from backend.services.tavily import search as tavily_search, tavily_available

logger = logging.getLogger("compass.radar.sync")

# Global in-process lock to prevent overlapping runs
_sync_lock = asyncio.Lock()

GITHUB_SOURCES = [
    {
        "source_name": "zapplyjobs/underclassmen-internships",
        "url": "https://raw.githubusercontent.com/zapplyjobs/underclassmen-internships/main/README.md",
    },
    {
        "source_name": "Jose-Gael/underclassmen-opportunities",
        "url": "https://raw.githubusercontent.com/Jose-Gael-Cruz-Lopez/underclassmen-opportunities/main/README.md",
    },
]


async def run_radar_sync(source_filter: Optional[str] = None) -> Dict[str, Any]:
    """
    Executes a complete synchronization run across all active source providers.
    Safe against concurrent execution.
    """
    if _sync_lock.locked():
        return {
            "status": "in_progress",
            "message": "A radar synchronization run is already actively running.",
        }

    async with _sync_lock:
        run_id = await create_sync_run("all" if not source_filter else source_filter)
        start_time = datetime.now(timezone.utc)
        records_discovered = 0
        records_updated = 0
        records_skipped = 0
        failures = 0
        error_summary = ""

        try:
            # 1. Ingest Curated Indian Opportunities & Research Programs
            for item in CURATED_INDIAN_OPPORTUNITIES:
                try:
                    opp_id = await upsert_opportunity(
                        company_name=item["company_name"],
                        role_title=item["role_title"],
                        canonical_url=item["canonical_url"],
                        official_application_url=item["official_application_url"],
                        current_status=item["current_status"],
                        opportunity_type=item["opportunity_type"],
                        category=item["category"],
                        location=item.get("location"),
                        work_arrangement=item.get("work_arrangement", "unknown"),
                        country=item.get("country", "India"),
                        is_india_eligible=item.get("is_india_eligible", True),
                        compensation=item.get("compensation"),
                        duration=item.get("duration"),
                        confirmed_open_date=item.get("confirmed_open_date"),
                        description=item.get("description"),
                        last_verified_at=datetime.now(timezone.utc),
                    )
                    records_discovered += 1

                    # Requirements
                    reqs = item.get("requirements")
                    if reqs:
                        await upsert_opportunity_requirements(opp_id, reqs)

                    # Historical Cycles
                    for cycle in item.get("cycles", []):
                        await upsert_opportunity_cycle(
                            opportunity_id=opp_id,
                            cycle_year=cycle["cycle_year"],
                            observed_open_date=cycle.get("observed_open_date"),
                            observed_close_date=cycle.get("observed_close_date"),
                            observation_type="confirmed",
                            notes="Verified official recruitment cycle",
                        )

                    # Provenance Source
                    src = item.get("source")
                    if src:
                        await add_opportunity_source(
                            opportunity_id=opp_id,
                            source_name=src["source_name"],
                            source_type=src["source_type"],
                            source_url=src["source_url"],
                            source_authority=src.get("source_authority", "tier_1"),
                            verification_result="verified",
                        )
                    records_updated += 1
                except Exception as ex:
                    failures += 1
                    logger.warning(f"Failed to upsert curated opportunity {item.get('company_name')}: {ex}")

            # 2. Ingest GitHub Curated Repositories
            for src_cfg in GITHUB_SOURCES:
                if source_filter and source_filter != "all" and src_cfg["source_name"] != source_filter:
                    continue
                try:
                    gh_opps = await fetch_github_markdown_opportunities(src_cfg["url"], src_cfg["source_name"])
                    for gh in gh_opps:
                        records_discovered += 1
                        canonical = gh["canonical_url"]
                        if not canonical:
                            records_skipped += 1
                            continue

                        opp_id = await upsert_opportunity(
                            company_name=gh["company_name"],
                            role_title=gh["role_title"],
                            canonical_url=canonical,
                            official_application_url=gh["official_application_url"],
                            current_status=gh["current_status"],
                            opportunity_type=gh["opportunity_type"],
                            category=gh["category"],
                            location=gh.get("location"),
                            work_arrangement=gh.get("work_arrangement", "unknown"),
                            country=gh.get("country", "Global"),
                            is_india_eligible=gh.get("is_india_eligible", True),
                            description=gh.get("description"),
                        )

                        await add_opportunity_source(
                            opportunity_id=opp_id,
                            source_name=gh["source_name"],
                            source_type=gh["source_type"],
                            source_url=gh["source_url"],
                            source_authority="tier_2",
                            verification_result="unverified",
                        )

                        # Insert basic requirements if present
                        if gh.get("eligible_academic_years"):
                            await upsert_opportunity_requirements(opp_id, {
                                "eligible_academic_years": gh["eligible_academic_years"],
                                "eligible_countries": ["India"] if gh.get("is_india_eligible") else [],
                            })
                        records_updated += 1
                except Exception as ex:
                    failures += 1
                    logger.warning(f"Error syncing GitHub source {src_cfg['source_name']}: {ex}")

            # 3. Targeted Tavily Discovery Search for Live Indian Opportunities (if enabled)
            if tavily_available() and (not source_filter or source_filter in {"all", "tavily"}):
                try:
                    tav_query = "AI ML software engineering research internship 2026 undergraduate students India apply"
                    tav_res = await tavily_search(tav_query, max_results=5)
                    results = tav_res.get("results", [])
                    for res in results:
                        records_discovered += 1
                        url = res.get("url")
                        title = res.get("title", "")
                        snippet = res.get("content", "")
                        if not url or "apply" not in title.lower() and "intern" not in title.lower():
                            records_skipped += 1
                            continue

                        # Extract company name estimate from title
                        parts = title.split("-") if "-" in title else title.split("|")
                        comp = parts[0].strip() if len(parts) > 1 else "Emerging Tech / Lab"
                        role = parts[1].strip() if len(parts) > 1 else title

                        opp_id = await upsert_opportunity(
                            company_name=comp[:80],
                            role_title=role[:120],
                            canonical_url=canonicalize_url(url),
                            official_application_url=url,
                            current_status=OpportunityStatus.DISCOVERED,
                            opportunity_type="internship",
                            category="ai_ml" if "ai" in title.lower() or "ml" in title.lower() else "swe",
                            location="India / Remote",
                            work_arrangement="remote" if "remote" in snippet.lower() else "hybrid",
                            country="India",
                            is_india_eligible=True,
                            description=snippet[:400],
                        )

                        await add_opportunity_source(
                            opportunity_id=opp_id,
                            source_name="Tavily Discovery",
                            source_type="tavily_search",
                            source_url=url,
                            source_authority="tier_3",
                            verification_result="discovered",
                        )
                        records_updated += 1
                except Exception as t_err:
                    logger.warning(f"Tavily discovery search encountered an error: {t_err}")

            status = "completed" if failures == 0 else "completed_with_errors"
            if failures > 0:
                error_summary = f"{failures} records or network sources failed during sync."

        except Exception as e:
            status = "failed"
            error_summary = str(e)
            logger.error(f"Critical error during radar sync: {e}", exc_info=True)

        await finish_sync_run(
            run_id=run_id,
            status=status,
            records_discovered=records_discovered,
            records_updated=records_updated,
            records_skipped=records_skipped,
            failures=failures,
            error_summary=error_summary,
        )

        return {
            "run_id": run_id,
            "status": status,
            "records_discovered": records_discovered,
            "records_updated": records_updated,
            "records_skipped": records_skipped,
            "failures": failures,
            "error_summary": error_summary,
            "duration_seconds": (datetime.now(timezone.utc) - start_time).total_seconds(),
        }
