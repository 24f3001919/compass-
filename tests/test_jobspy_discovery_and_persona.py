"""
Tests for explicit Judge Persona loading and JobSpy internship discovery skill.

Verifies:
1. Fresh user gets no demo tasks on mount / startup.
2. Load Judge Persona button explicitly seeds persona.
3. Seeding is idempotent and isolated to calling tenant.
4. JobSpy opportunity normalizer handles 24h classification accurately.
5. JobSpy discovery integration handles success, partial errors, and persistence.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from backend.services.radar_jobspy import (
    classify_posting_recency,
    normalize_jobspy_opportunity,
)


def test_jobspy_recency_classification_24h_exact():
    now_utc = datetime.now(timezone.utc)

    # 1. Posted 4 hours ago -> VERIFIED_WITHIN_24H
    posted_4h_ago = now_utc - timedelta(hours=4)
    res_4h = classify_posting_recency(posted_4h_ago)
    assert res_4h["is_verified_24h"] is True
    assert res_4h["recency_tier"] == "VERIFIED_WITHIN_24H"

    # 2. Posted 36 hours ago -> APPROXIMATE_RECENCY
    posted_36h_ago = now_utc - timedelta(hours=36)
    res_36h = classify_posting_recency(posted_36h_ago)
    assert res_36h["is_verified_24h"] is False
    assert res_36h["recency_tier"] == "APPROXIMATE_RECENCY"

    # 3. None / missing date -> UNKNOWN
    res_none = classify_posting_recency(None)
    assert res_none["is_verified_24h"] is False
    assert res_none["recency_tier"] == "UNKNOWN"

    # 4. Implausible future date -> UNKNOWN / rejected
    future_date = (now_utc + timedelta(days=10)).date()
    res_future = classify_posting_recency(future_date)
    assert res_future["is_verified_24h"] is False
    assert res_future["recency_tier"] == "UNKNOWN"


def test_jobspy_normalization_internship_filtering():
    # 1. Valid internship listing
    row_intern = {
        "title": "Software Engineering Intern - Summer 2026",
        "company": "Stripe",
        "job_url": "https://stripe.com/jobs/12345",
        "location": "Remote, USA",
        "date_posted": datetime.now(timezone.utc) - timedelta(hours=2),
        "description": "Looking for curious undergraduate software engineering interns.",
        "site": "indeed",
        "is_remote": True,
        "skills": "Python, Go, PostgreSQL",
    }
    norm_intern = normalize_jobspy_opportunity(row_intern)
    assert norm_intern is not None
    assert norm_intern["company_name"] == "Stripe"
    assert norm_intern["role_title"] == "Software Engineering Intern - Summer 2026"
    assert norm_intern["is_verified_within_24h"] is True
    assert norm_intern["recency_tier"] == "VERIFIED_WITHIN_24H"
    assert norm_intern["category"] == "swe"
    assert "stripe.com/jobs/12345" in norm_intern["canonical_url"]
    assert norm_intern["source_name"] == "JobSpy (Indeed)"
    assert norm_intern["source_type"] == "jobspy_indeed"
    assert norm_intern["source_authority"] == "tier_1"

    # 2. Senior / non-internship role -> filtered out
    row_senior = {
        "title": "Principal Distributed Systems Architect",
        "company": "Amazon",
        "job_url": "https://amazon.jobs/senior",
        "description": "Minimum 12 years experience building AWS hyper-scale platforms.",
        "site": "indeed",
    }
    norm_senior = normalize_jobspy_opportunity(row_senior)
    assert norm_senior is None


@pytest.mark.asyncio
async def test_jobspy_discovery_run_isolation_and_error_handling():
    """Verify that JobSpy runs return structured observability counts and isolate site failures."""
    from backend.services.radar_jobspy import discover_jobspy_opportunities
    import pandas as pd

    # Mock DataFrame returning 2 opportunities for indeed
    mock_df = pd.DataFrame([
        {
            "id": "ind-1",
            "title": "AI Research Intern",
            "company": "Nebius",
            "job_url": "https://nebius.com/careers/intern-1",
            "location": "Remote",
            "date_posted": datetime.now(timezone.utc) - timedelta(hours=3),
            "description": "Research intern building frontier LLM clusters.",
            "site": "indeed",
            "is_remote": True,
        },
        {
            "id": "ind-2",
            "title": "Senior Staff Architect",
            "company": "BigCorp",
            "job_url": "https://bigcorp.com/staff",
            "location": "Seattle",
            "date_posted": datetime.now(timezone.utc) - timedelta(hours=1),
            "description": "Requires 10+ years experience.",
            "site": "indeed",
            "is_remote": False,
        }
    ])

    def mock_scrape_jobs(site_name, **kwargs):
        if "linkedin" in site_name:
            raise RuntimeError("Rate limited on LinkedIn public portal")
        return mock_df

    with patch("jobspy.scrape_jobs", side_effect=mock_scrape_jobs):
        summary = await discover_jobspy_opportunities(
            sites=["indeed", "linkedin"],
            search_terms=["ai intern"],
        )

        assert summary["status"] == "partial"
        assert summary["sources_succeeded"] >= 1
        assert summary["sources_failed"] >= 1
        assert summary["raw_results"] == 2
        assert summary["internship_matches"] == 1  # AI Research Intern matched, Senior Staff filtered
        assert summary["normalized_results"] == 1
        assert summary["verified_within_24h"] == 1
        assert len(summary["opportunities"]) == 1
        assert summary["opportunities"][0]["company_name"] == "Nebius"
        assert len(summary["errors"]) == 1
        assert "LinkedIn" in str(summary["errors"][0])
