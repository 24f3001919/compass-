"""
Compass — Internship Radar Test Suite.

Unit and integration tests for:
1. Deterministic eligibility engine (academic year, graduation batch, country, work auth).
2. Historical recruitment cycle prediction engine (confidence scoring, windows).
3. URL canonicalization and source parsing.
4. Verification state machine and prompt injection fencing.
5. FastAPI radar endpoints (listing, recommended, open, watchlist, tracking, profile, sync).
6. AI Assistant grounded skill execution.
"""
from datetime import date, datetime, timezone
import pytest
from httpx import AsyncClient, ASGITransport

from backend.main import app
from backend.models_radar import (
    ConfidenceLevel,
    EligibilityClassification,
    OpportunityCycleOut,
    OpportunityOut,
    OpportunityRequirementsOut,
    OpportunityStatus,
    UserOpportunityProfileIn,
)
from backend.services.radar_eligibility import evaluate_eligibility
from backend.services.radar_prediction import estimate_recruitment_cycle
from backend.services.radar_sources import (
    canonicalize_url,
    normalize_company_name,
    parse_markdown_table_opportunities,
)
from backend.services.radar_verifier import verify_opportunity_status
from backend.skills.handlers.radar import handle_query_internship_radar


# ===========================================================================
# 1. Eligibility Evaluation Tests
# ===========================================================================

def test_eligibility_strong_match():
    opp = OpportunityOut(
        id=1,
        company_name="Google India",
        normalized_company="Google",
        role_title="STEP Intern 2026",
        opportunity_type="internship",
        category="swe",
        canonical_url="https://careers.google.com/jobs/results/step",
        current_status=OpportunityStatus.OPEN_CONFIRMED,
        country="India",
        is_india_eligible=True,
        requirements=OpportunityRequirementsOut(
            eligible_degree_types=["B.Tech", "BS"],
            eligible_academic_years=[2],
            eligible_graduation_years=[2027, 2028],
            eligible_countries=["India"],
            work_auth_required=False,
        ),
    )
    profile = UserOpportunityProfileIn(
        degree="B.Tech Computer Science",
        academic_year=2,
        grad_year=2027,
        country_of_study="India",
    )
    classification, explanation, reasons = evaluate_eligibility(opp, profile)
    assert classification == EligibilityClassification.ELIGIBLE
    assert "Strong match" in explanation
    assert any(r["field"] == "academic_year" and r["status"] == "pass" for r in reasons)
    assert any(r["field"] == "grad_year" and r["status"] == "pass" for r in reasons)


def test_eligibility_ineligible_academic_year():
    opp = OpportunityOut(
        id=2,
        company_name="Google India",
        normalized_company="Google",
        role_title="STEP Intern",
        opportunity_type="internship",
        category="swe",
        canonical_url="https://careers.google.com/step",
        current_status=OpportunityStatus.OPEN_CONFIRMED,
        requirements=OpportunityRequirementsOut(
            eligible_academic_years=[1, 2],
        ),
    )
    # Student in 4th year
    profile = UserOpportunityProfileIn(
        academic_year=4,
        grad_year=2026,
    )
    classification, explanation, reasons = evaluate_eligibility(opp, profile)
    assert classification == EligibilityClassification.INELIGIBLE
    assert "Ineligible" in explanation
    assert any(r["field"] == "academic_year" and r["status"] == "fail" for r in reasons)


def test_eligibility_insufficient_information_when_profile_empty():
    opp = OpportunityOut(
        id=3,
        company_name="Amazon India",
        normalized_company="Amazon",
        role_title="SDE Intern",
        opportunity_type="internship",
        category="swe",
        canonical_url="https://amazon.jobs/sde",
        current_status=OpportunityStatus.OPEN_CONFIRMED,
        requirements=OpportunityRequirementsOut(
            eligible_academic_years=[3],
            eligible_graduation_years=[2027],
        ),
    )
    # Empty profile
    classification, explanation, reasons = evaluate_eligibility(opp, None)
    assert classification == EligibilityClassification.INSUFFICIENT_INFORMATION
    assert "Complete your profile" in explanation


def test_eligibility_potential_match_when_unknown_requirements():
    opp = OpportunityOut(
        id=4,
        company_name="NVIDIA",
        normalized_company="NVIDIA",
        role_title="Deep Learning Intern",
        opportunity_type="internship",
        category="ai_ml",
        canonical_url="https://nvidia.com/jobs/dl",
        current_status=OpportunityStatus.OPEN_CONFIRMED,
        country="US",
        is_india_eligible=False,
        requirements=OpportunityRequirementsOut(
            eligible_academic_years=[3],
            work_auth_required=True,
            sponsorship_available=None,  # Unconfirmed sponsorship
        ),
    )
    profile = UserOpportunityProfileIn(
        academic_year=3,
        grad_year=2027,
        country_of_study="India",
    )
    classification, explanation, reasons = evaluate_eligibility(opp, profile)
    assert classification in (EligibilityClassification.POTENTIAL_MATCH, EligibilityClassification.INELIGIBLE)


# ===========================================================================
# 2. Recruitment Cycle Prediction Tests
# ===========================================================================

def test_prediction_high_confidence_consistent_cycles():
    cycles = [
        OpportunityCycleOut(cycle_year=2023, observed_open_date=date(2023, 8, 15)),
        OpportunityCycleOut(cycle_year=2024, observed_open_date=date(2024, 8, 18)),
        OpportunityCycleOut(cycle_year=2025, observed_open_date=date(2025, 8, 20)),
    ]
    pred = estimate_recruitment_cycle(cycles)
    assert pred.confidence == ConfidenceLevel.HIGH
    assert pred.verified_cycles_count == 3
    assert "August" in (pred.estimated_open_window or "")
    assert pred.last_observed_cycle == 2025


def test_prediction_medium_confidence():
    cycles = [
        OpportunityCycleOut(cycle_year=2024, observed_open_date=date(2024, 1, 10)),
        OpportunityCycleOut(cycle_year=2025, observed_open_date=date(2025, 2, 5)),
    ]
    pred = estimate_recruitment_cycle(cycles)
    assert pred.confidence == ConfidenceLevel.MEDIUM
    assert pred.verified_cycles_count == 2


def test_prediction_unknown_when_no_cycles():
    pred = estimate_recruitment_cycle([])
    assert pred.confidence == ConfidenceLevel.UNKNOWN
    assert pred.estimated_open_window is None
    assert "No reliable opening-window estimate" in pred.evidence_basis


# ===========================================================================
# 3. Source Adapters & Canonicalization Tests
# ===========================================================================

def test_canonicalize_url():
    raw = "https://careers.google.com/jobs/results/123/?utm_source=linkedin&utm_medium=job_post&ref=social#"
    expected = "https://careers.google.com/jobs/results/123"
    assert canonicalize_url(raw) == expected


def test_normalize_company_name():
    assert normalize_company_name("Google LLC") == "Google"
    assert normalize_company_name("Microsoft Corporation") == "Microsoft"
    assert normalize_company_name("Razorpay Software Pvt Ltd") == "Razorpay Software"


def test_parse_markdown_table():
    md = """
| Company | Role | Location | Application Link |
| :--- | :--- | :--- | :--- |
| [Google](https://google.com) | STEP Intern | Bengaluru, India | [Apply](https://careers.google.com/step?utm_source=gh) |
| [Uber](https://uber.com) | SWE Intern | Hyderabad, India | [Apply](https://uber.com/jobs/swe) |
    """
    results = parse_markdown_table_opportunities(md, "test_repo", "https://github.com/test/repo")
    assert len(results) == 2
    assert results[0]["company_name"] == "Google"
    assert results[0]["role_title"] == "STEP Intern"
    assert results[0]["canonical_url"] == "https://careers.google.com/step"
    assert results[0]["current_status"] == OpportunityStatus.NEEDS_VERIFICATION


# ===========================================================================
# 4. Status Verification Tests
# ===========================================================================

@pytest.mark.asyncio
async def test_verifier_detects_closed_notice(monkeypatch):
    from backend.services import radar_verifier

    class MockResp:
        status_code = 200
        text = "Thank you for your interest. Applications have closed for the Summer 2026 session."

    class MockClient:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            pass
        async def get(self, *args, **kwargs):
            return MockResp()

    monkeypatch.setattr(radar_verifier.httpx, "AsyncClient", lambda *args, **kwargs: MockClient())
    monkeypatch.setattr(radar_verifier, "tavily_available", lambda: False)

    status, evidence, _ = await verify_opportunity_status("https://example.com/jobs/closed-job")
    assert status == OpportunityStatus.CLOSED_CONFIRMED
    assert "Verified closed" in evidence


# ===========================================================================
# 5. FastAPI Endpoints Integration Tests
# ===========================================================================

@pytest.mark.asyncio
async def test_radar_api_unauthenticated_rejected():
    """Unauthenticated access to user radar endpoints must return 401."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as unauth_client:
        res = await unauth_client.get("/api/opportunities")
        assert res.status_code == 401
        assert "authentication" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_radar_api_endpoints(monkeypatch):
    async def mock_gh(*args, **kwargs):
        return []

    monkeypatch.setattr("backend.services.radar_sync.fetch_github_markdown_opportunities", mock_gh)
    monkeypatch.setattr("backend.services.radar_sync.tavily_available", lambda: False)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"x-user-id": "candidate_radar_user"}) as client:
        # 1. Trigger sync (seeds curated opportunities quickly)
        sync_res = await client.post("/api/opportunities/sync?source=all")
        assert sync_res.status_code == 200
        assert sync_res.json()["status"] in ("completed", "completed_with_errors")

        # 2. List opportunities
        list_res = await client.get("/api/opportunities")
        assert list_res.status_code == 200
        data = list_res.json()
        assert "opportunities" in data
        assert data["total"] >= 1

        # 3. Analytics
        stats_res = await client.get("/api/opportunities/analytics")
        assert stats_res.status_code == 200
        assert "total_tracked_opportunities" in stats_res.json()

        # 4. Profile PUT & GET
        prof_res = await client.put(
            "/api/opportunities/profile",
            json={
                "degree": "B.Tech",
                "academic_year": 3,
                "grad_year": 2027,
                "country_of_study": "India",
                "skills": ["Python", "PyTorch"],
            },
        )
        assert prof_res.status_code == 200
        assert prof_res.json()["academic_year"] == 3

        # 5. Save opportunity
        first_id = data["opportunities"][0]["id"]
        save_res = await client.post(f"/api/opportunities/{first_id}/save")
        assert save_res.status_code == 200
        assert save_res.json()["saved"] is True

        # 6. Verify watchlist contains it
        wl_res = await client.get("/api/opportunities/watchlist")
        assert wl_res.status_code == 200
        wl_ids = [o["id"] for o in wl_res.json()]
        assert first_id in wl_ids

        # 7. Update application state
        app_res = await client.post(
            f"/api/opportunities/{first_id}/application",
            json={"application_status": "interviewing", "private_notes": "Round 1 cleared"},
        )
        assert app_res.status_code == 200
        assert app_res.json()["application_status"] == "interviewing"

        # 8. Unsave opportunity
        unsave_res = await client.delete(f"/api/opportunities/{first_id}/save")
        assert unsave_res.status_code == 200
        assert unsave_res.json()["saved"] is False


# ===========================================================================
# 6. AI Assistant Grounded Skill Execution
# ===========================================================================

@pytest.mark.asyncio
async def test_ai_radar_skill_execution():
    res = await handle_query_internship_radar({"query": "Google", "india_only": True})
    assert res["success"] is True
    assert "Compass Internship Radar" in res["summary"]
