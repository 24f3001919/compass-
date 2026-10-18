"""
Compass — Career Copilot Profile Modal & Contract Regression Tests.

Covers:
1. Modal API contracts (GET /api/opportunities/profile, PUT /api/opportunities/profile).
2. Strict authentication & guest session isolation.
3. Input validation (academic year 1-5, graduation month 1-12, graduation year).
4. Profile persistence and update roundtrip.
5. Deterministic eligibility matching integration with updated profile.
6. Multi-tenant isolation (user A cannot access or mutate user B's profile).
"""
import pytest
from httpx import AsyncClient, ASGITransport

from backend.main import app
from backend.dependencies import generate_guest_token


@pytest.mark.asyncio
async def test_profile_unauthenticated_rejected():
    """Unauthenticated requests without session or guest token are rejected with 401."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/opportunities/profile")
        assert res.status_code == 401
        assert "authentication" in res.json()["detail"].lower()

        put_res = await client.put(
            "/api/opportunities/profile",
            json={"degree": "B.Tech", "academic_year": 3, "grad_year": 2027},
        )
        assert put_res.status_code == 401


@pytest.mark.asyncio
async def test_profile_guest_session_roundtrip():
    """Verified guest token allows fetching and updating personal opportunity profile."""
    guest_uuid = "00000000-0000-0000-0000-000000000501"
    gid, token = generate_guest_token(guest_uuid)
    headers = {"x-guest-token": token}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers=headers) as client:
        # Initial profile has missing fields flagged
        get_res = await client.get("/api/opportunities/profile")
        assert get_res.status_code == 200
        data = get_res.json()
        assert data["user_id"] == guest_uuid

        # Update profile with full academic and preference details
        payload = {
            "degree": "B.Tech",
            "degree_specialization": "Computer Science & Engineering",
            "university": "IIT Delhi",
            "academic_year": 3,
            "grad_year": 2027,
            "grad_month": 6,
            "country_of_study": "India",
            "country_of_residence": "India",
            "preferred_work_arrangements": ["remote", "hybrid"],
            "preferred_roles": ["Software Engineering", "Artificial Intelligence and Machine Learning"],
            "skills": ["Python", "PyTorch", "Data Structures", "FastAPI"],
        }
        put_res = await client.put("/api/opportunities/profile", json=payload)
        assert put_res.status_code == 200
        saved = put_res.json()
        assert saved["degree"] == "B.Tech"
        assert saved["university"] == "IIT Delhi"
        assert saved["academic_year"] == 3
        assert saved["grad_year"] == 2027
        assert saved["skills"] == ["Python", "PyTorch", "Data Structures", "FastAPI"]
        assert saved["missing_fields_limiting_eligibility"] == []

        # Subsequent GET preserves the updated values
        get_res2 = await client.get("/api/opportunities/profile")
        assert get_res2.status_code == 200
        saved2 = get_res2.json()
        assert saved2["university"] == "IIT Delhi"
        assert saved2["grad_year"] == 2027


@pytest.mark.asyncio
async def test_profile_user_tenant_isolation():
    """Profiles are strictly isolated between different users/guests."""
    user1_headers = {"x-user-id": "test_candidate_1"}
    user2_headers = {"x-user-id": "test_candidate_2"}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Candidate 1 sets profile
        put1 = await client.put(
            "/api/opportunities/profile",
            headers=user1_headers,
            json={
                "degree": "B.Tech",
                "university": "IIT Madras",
                "academic_year": 2,
                "grad_year": 2028,
                "skills": ["C++", "CUDA"],
            },
        )
        assert put1.status_code == 200

        # Candidate 2 sets different profile
        put2 = await client.put(
            "/api/opportunities/profile",
            headers=user2_headers,
            json={
                "degree": "BS",
                "university": "IISc Bangalore",
                "academic_year": 4,
                "grad_year": 2026,
                "skills": ["Rust", "Distributed Systems"],
            },
        )
        assert put2.status_code == 200

        # Candidate 1 reads profile - must see IIT Madras, not IISc
        get1 = await client.get("/api/opportunities/profile", headers=user1_headers)
        assert get1.status_code == 200
        assert get1.json()["university"] == "IIT Madras"
        assert get1.json()["academic_year"] == 2

        # Candidate 2 reads profile - must see IISc, not IIT Madras
        get2 = await client.get("/api/opportunities/profile", headers=user2_headers)
        assert get2.status_code == 200
        assert get2.json()["university"] == "IISc Bangalore"
        assert get2.json()["academic_year"] == 4


@pytest.mark.asyncio
async def test_profile_validation_rejects_invalid_values():
    """Backend validates fields and rejects out-of-range academic year or grad month with 422."""
    headers = {"x-user-id": "test_validation_user"}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers=headers) as client:
        # Academic year 0 is invalid (must be 1..5)
        res_ay = await client.put(
            "/api/opportunities/profile",
            json={"academic_year": 0, "grad_year": 2027},
        )
        assert res_ay.status_code == 422

        # Academic year 6 is invalid
        res_ay6 = await client.put(
            "/api/opportunities/profile",
            json={"academic_year": 6, "grad_year": 2027},
        )
        assert res_ay6.status_code == 422

        # Grad month 13 is invalid (must be 1..12)
        res_month = await client.put(
            "/api/opportunities/profile",
            json={"academic_year": 3, "grad_month": 13},
        )
        assert res_month.status_code == 422


@pytest.mark.asyncio
async def test_profile_updates_eligibility_classification():
    """Updating academic profile flips opportunity classification from INSUFFICIENT_INFO to ELIGIBLE."""
    from backend.memory.radar import upsert_opportunity, upsert_opportunity_requirements
    from backend.models_radar import (
        OpportunityStatus,
        EligibilityClassification,
    )

    opp_id = await upsert_opportunity(
        company_name="Acme AI",
        role_title="AI Research Intern 2027",
        canonical_url="https://acme.ai/careers/intern-2027",
        current_status=OpportunityStatus.OPEN_CONFIRMED,
        country="India",
        is_india_eligible=True,
        category="ai_ml",
    )
    await upsert_opportunity_requirements(
        opp_id,
        {
            "eligible_degree_types": ["B.Tech", "BS"],
            "eligible_academic_years": [3],
            "eligible_graduation_years": [2027],
            "eligible_countries": ["India"],
            "required_skills": ["Python", "PyTorch"],
        },
    )

    import uuid
    fresh_user_id = f"elig_cand_{uuid.uuid4().hex[:8]}"
    candidate_headers = {"x-user-id": fresh_user_id}
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers=candidate_headers) as client:
        # 1. Without profile, opportunity classification is INSUFFICIENT_INFORMATION
        res_before = await client.get("/api/opportunities")
        assert res_before.status_code == 200
        opp_before = next((o for o in res_before.json()["opportunities"] if o["id"] == opp_id), None)
        assert opp_before is not None
        assert opp_before["eligibility_classification"] == EligibilityClassification.INSUFFICIENT_INFORMATION

        # 2. Save profile with matching 3rd year, 2027 grad year, India, Python
        save_res = await client.put(
            "/api/opportunities/profile",
            json={
                "degree": "B.Tech",
                "academic_year": 3,
                "grad_year": 2027,
                "country_of_study": "India",
                "skills": ["Python", "PyTorch"],
            },
        )
        assert save_res.status_code == 200

        # 3. After profile update, opportunity classification becomes ELIGIBLE
        res_after = await client.get("/api/opportunities")
        assert res_after.status_code == 200
        opp_after = next((o for o in res_after.json()["opportunities"] if o["id"] == opp_id), None)
        assert opp_after is not None
        assert opp_after["eligibility_classification"] == EligibilityClassification.ELIGIBLE
        assert "Strong match" in opp_after["eligibility_explanation"]


def test_vercel_spa_rewrites_configuration():
    """Verify vercel.json and frontend/vercel.json contain SPA fallback rewrites without blocking API routes."""
    import json
    from pathlib import Path

    repo_root = Path(__file__).parent.parent
    for conf_path in [repo_root / "vercel.json", repo_root / "frontend" / "vercel.json"]:
        assert conf_path.exists(), f"Missing configuration file: {conf_path}"
        with open(conf_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        rewrites = data.get("rewrites", [])
        assert len(rewrites) >= 4, f"{conf_path} must define proxy rewrites and SPA fallback"

        # Verify proxy destinations are preserved
        assert any(r.get("source") == "/health" and "onrender.com" in r.get("destination", "") for r in rewrites)
        assert any(r.get("source") == "/chat" and "onrender.com" in r.get("destination", "") for r in rewrites)
        assert any(r.get("source") == "/api/:path*" and "onrender.com" in r.get("destination", "") for r in rewrites)

        # Verify SPA fallback rewrite directs to index.html and does not intercept /api/, /chat, or /health
        spa_rewrite = next((r for r in rewrites if r.get("destination") == "/index.html"), None)
        assert spa_rewrite is not None, f"{conf_path} missing SPA fallback to /index.html"
        assert "(?!api/|chat|health)" in spa_rewrite["source"], "SPA fallback must exclude /api/, /chat, and /health"


@pytest.mark.asyncio
async def test_api_404_produces_structured_json():
    """Nonexistent API endpoints return JSON 404 without redirecting or returning HTML."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/nonexistent-endpoint-404")
        assert res.status_code == 404
        assert "detail" in res.json()
        assert res.headers["content-type"].startswith("application/json")


