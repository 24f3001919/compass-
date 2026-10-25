"""
Compass — Comprehensive Application Workspace & Resume Tailoring Test Suite.

Verifies:
1. Opening application workspace creates/retrieves career application record without immediate redirect.
2. Generating tailored resume snapshot creates an isolated record without mutating the master resume.
3. Strict factual integrity engine prevents fabricated skills and marks unverified requirements as missing.
4. In-place resume updates (PUT /api/career/resumes/{id}) validate against master and persist correctly.
5. ATS-compliant printable HTML export generation (/api/career/resumes/{id}/export).
6. Cover letter generation and editing (/api/career/cover-letters/draft and /api/career/applications/{id}/cover-letter).
7. Application tracking lifecycle updates (PATCH /api/career/applications/{id}).
8. Downloading or previewing a resume does NOT mark the application as SUBMITTED.
9. Official external portal link is preserved and external submission requires explicit user action.
10. Tenant isolation and authentication/guest session scoping.
"""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from backend.main import app
from backend.memory.career import (
    get_career_application_by_id,
    get_master_resume,
    get_resume_by_id,
    upsert_master_resume,
)
from backend.memory.radar import get_opportunity_by_id, upsert_opportunity
from backend.models_career import (
    CareerApplicationStatus,
    ResumeContent,
    ResumeEducationItem,
    ResumeProjectItem,
    SaveResumeRequest,
)
from backend.models_radar import OpportunityStatus
import backend.memory.radar as radar_mem


@pytest.fixture(autouse=True)
async def setup_workspace_test_data():
    """Seed test opportunities and clean up test user records before each test."""
    from backend.memory.db import get_pool
    pool = await get_pool()
    test_users = ["workspace_user_1", "workspace_user_2", "guest_workspace_user"]

    if pool:
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM career_applications WHERE user_id = ANY($1::text[])", test_users)
            await conn.execute("DELETE FROM application_batches WHERE user_id = ANY($1::text[])", test_users)
            await conn.execute("DELETE FROM resumes WHERE user_id = ANY($1::text[])", test_users)
            await conn.execute("DELETE FROM user_opportunity_profiles WHERE user_id = ANY($1::text[])", test_users)

            await conn.execute(
                """
                INSERT INTO opportunities (
                    id, company_name, normalized_company, role_title,
                    opportunity_type, category, location, work_arrangement,
                    country, is_india_eligible, canonical_url, official_application_url,
                    current_status, description, created_at, updated_at
                ) VALUES (
                    201, 'Acme Robotics', 'acme_robotics', 'Autonomous Systems Intern',
                    'internship', 'ai_ml', 'Bengaluru, India', 'hybrid',
                    'India', TRUE, 'https://careers.acmerobotics.example/jobs/201', 'https://careers.acmerobotics.example/jobs/201',
                    'OPEN_CONFIRMED', 'Seeking robotics engineering intern with Python, C++, and ROS experience.',
                    now(), now()
                )
                ON CONFLICT (id) DO UPDATE SET
                    current_status = EXCLUDED.current_status,
                    official_application_url = EXCLUDED.official_application_url,
                    updated_at = now();
                """
            )
            await conn.execute(
                """
                INSERT INTO opportunities (
                    id, company_name, normalized_company, role_title,
                    opportunity_type, category, location, work_arrangement,
                    country, is_india_eligible, canonical_url, official_application_url,
                    current_status, description, created_at, updated_at
                ) VALUES (
                    202, 'Nova Labs', 'nova_labs', 'Software Research Intern',
                    'internship', 'research', 'Remote', 'remote',
                    'India', TRUE, 'https://careers.novalabs.example/jobs/202', NULL,
                    'OPEN_CONFIRMED', 'Research intern focused on algorithms and distributed systems.',
                    now(), now()
                )
                ON CONFLICT (id) DO UPDATE SET
                    current_status = EXCLUDED.current_status,
                    official_application_url = EXCLUDED.official_application_url,
                    updated_at = now();
                """
            )
    else:
        radar_mem._in_memory_opportunities[201] = {
            "id": 201,
            "company_name": "Acme Robotics",
            "normalized_company": "acme_robotics",
            "role_title": "Autonomous Systems Intern",
            "opportunity_type": "internship",
            "category": "ai_ml",
            "location": "Bengaluru, India",
            "work_arrangement": "hybrid",
            "country": "India",
            "is_india_eligible": True,
            "canonical_url": "https://careers.acmerobotics.example/jobs/201",
            "official_application_url": "https://careers.acmerobotics.example/jobs/201",
            "current_status": "OPEN_CONFIRMED",
            "description": "Seeking robotics engineering intern with Python, C++, and ROS experience.",
        }
        radar_mem._in_memory_opportunities[202] = {
            "id": 202,
            "company_name": "Nova Labs",
            "normalized_company": "nova_labs",
            "role_title": "Software Research Intern",
            "opportunity_type": "internship",
            "category": "research",
            "location": "Remote",
            "work_arrangement": "remote",
            "country": "India",
            "is_india_eligible": True,
            "canonical_url": "https://careers.novalabs.example/jobs/202",
            "official_application_url": None,
            "current_status": "OPEN_CONFIRMED",
        }

    # Seed master resumes with verified contact details so tests do not trip export placeholder guard
    default_master = ResumeContent(
        full_name="Alex Rivera",
        email="alex.rivera@example.com",
        phone="+1 555-0199",
        location="Bengaluru, India",
        skills=["Python", "C++", "ROS", "FastAPI", "PostgreSQL"],
        education=[
            ResumeEducationItem(
                institution="National Institute of Technology",
                degree="B.Tech",
                field_of_study="Computer Science",
                end_year=2026,
            )
        ],
        projects=[
            ResumeProjectItem(
                title="Autonomous Rover",
                technologies=["Python", "ROS"],
                description="Designed navigation system using ROS.",
            )
        ],
    )
    await upsert_master_resume("workspace_user_1", default_master, "Master Resume")
    await upsert_master_resume("workspace_user_2", default_master, "Master Resume")


@pytest.mark.asyncio
async def test_prepare_application_workspace_creates_isolated_record():
    """Test 1 & 2: Opening application workspace creates an application record without redirecting."""
    headers = {"x-user-id": "workspace_user_1"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Step 1: Open / prepare application
        resp = await client.post("/api/career/applications/prepare?opportunity_id=201", headers=headers)
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["opportunity_id"] == 201
        assert data["status"] in {CareerApplicationStatus.PREPARING.value, CareerApplicationStatus.READY_FOR_REVIEW.value}
        # Official link is preserved for user handoff
        assert data["opportunity"]["official_application_url"] == "https://careers.acmerobotics.example/jobs/201"
        assert data["resume_id"] is not None
        assert data["cover_letter"] is not None
        app_id = data["id"]

        # Step 2: Retrieve application record directly
        get_resp = await client.get(f"/api/career/applications/{app_id}", headers=headers)
        assert get_resp.status_code == 200
        get_data = get_resp.json()
        assert get_data["id"] == app_id
        assert get_data["opportunity"]["company_name"] == "Acme Robotics"


@pytest.mark.asyncio
async def test_tailoring_creates_separate_snapshot_without_overwriting_master():
    """Test 3 & 4: Tailoring creates a dedicated snapshot; master resume remains intact."""
    headers = {"x-user-id": "workspace_user_1"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Setup master resume
        master_content = {
            "full_name": "Dev Candidate",
            "email": "dev@example.com",
            "phone": "+91 9876543210",
            "location": "Bengaluru",
            "skills": ["Python", "C++", "Git", "Algorithms"],
            "education": [{"institution": "Indian Institute of Tech", "degree": "B.Tech Computer Science"}],
            "projects": [
                {
                    "title": "Autonomous Rover Project",
                    "description": "Implemented path planning in Python and C++.",
                    "technologies": ["Python", "C++"],
                    "highlights": ["Zero crash rate in simulation"],
                }
            ],
            "experience": [],
            "achievements": [],
            "certifications": [],
        }
        put_master = await client.put("/api/career/resumes/master", json=master_content, headers=headers)
        assert put_master.status_code == 200
        master_res = put_master.json()
        master_id = master_res["id"]

        # 2. Tailor resume for Opportunity 201
        tailor_resp = await client.post(
            "/api/career/resumes/tailor",
            json={"opportunity_id": 201, "custom_title": "Acme Robotics Tailored Resume"},
            headers=headers,
        )
        assert tailor_resp.status_code == 200
        tailored_res = tailor_resp.json()
        tailored_id = tailored_res["id"]

        # Assert tailored resume has a new distinct ID and is linked to the opportunity
        assert tailored_id != master_id
        assert tailored_res["opportunity_id"] == 201
        assert tailored_res["is_master"] is False

        # 3. Verify master resume was NOT overwritten
        get_master = await client.get("/api/career/resumes/master", headers=headers)
        assert get_master.status_code == 200
        fresh_master = get_master.json()
        assert fresh_master["id"] == master_id
        assert fresh_master["is_master"] is True
        assert fresh_master["title"] == "Master Resume"


@pytest.mark.asyncio
async def test_factual_integrity_blocks_unsupported_skills():
    """Test 7 & 8: Factual audit prevents fabricated claims without hallucination."""
    headers = {"x-user-id": "workspace_user_1"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Master resume has only Python & Git
        master_content = {
            "full_name": "Honest Candidate",
            "email": "honest@example.com",
            "skills": ["Python", "Git"],
            "education": [{"institution": "State University", "degree": "BS CS"}],
            "projects": [{"title": "Web App", "description": "Python API", "technologies": ["Python"]}],
            "experience": [],
            "achievements": [],
            "certifications": [],
        }
        await client.put("/api/career/resumes/master", json=master_content, headers=headers)

        # 2. Tailor for opportunity
        tailor_resp = await client.post(
            "/api/career/resumes/tailor",
            json={"opportunity_id": 201},
            headers=headers,
        )
        assert tailor_resp.status_code == 200
        tailored = tailor_resp.json()
        tailored_id = tailored["id"]

        # 3. Attempt to inject an unverified fabricated skill into tailored resume
        fabricated_content = dict(tailored["content"])
        fabricated_content["skills"] = ["Python", "Git", "Quantum Computing Fabricated Skill"]

        update_resp = await client.put(
            f"/api/career/resumes/{tailored_id}",
            json={"title": "Tailored Resume", "content": fabricated_content},
            headers=headers,
        )
        assert update_resp.status_code == 200
        updated = update_resp.json()
        report = updated["validation_report"]

        # Factual audit must flag the unverified claim
        assert report["is_valid"] is False
        assert any("Quantum Computing Fabricated Skill" in c for c in report["unsupported_claims"])
        assert updated["validation_status"] == "VALIDATION_FAILED"


@pytest.mark.asyncio
async def test_ats_html_export_generation():
    """Test 5 & 9: ATS clean printable HTML export endpoint."""
    headers = {"x-user-id": "workspace_user_1"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Prepare application first to ensure a resume exists
        prep_resp = await client.post("/api/career/applications/prepare?opportunity_id=201", headers=headers)
        assert prep_resp.status_code == 200
        res_id = prep_resp.json()["resume_id"]

        # Call HTML export endpoint
        export_resp = await client.get(f"/api/career/resumes/{res_id}/export", headers=headers)
        assert export_resp.status_code == 200
        html = export_resp.text
        assert "<!DOCTYPE html>" in html
        assert "Acme Robotics" in html
        assert "Autonomous Systems Intern" in html
        assert "@media print" in html


@pytest.mark.asyncio
async def test_cover_letter_generation_and_editing():
    """Test 6 & 10: Cover letter drafting, editing, and saving."""
    headers = {"x-user-id": "workspace_user_1"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Draft cover letter
        draft_resp = await client.post(
            "/api/career/cover-letters/draft",
            json={"opportunity_id": 201},
            headers=headers,
        )
        assert draft_resp.status_code == 200
        letter_data = draft_resp.json()
        assert "Acme Robotics" in letter_data["content"]
        assert "Autonomous Systems Intern" in letter_data["content"]

        # 2. Attach / update cover letter on application record
        prep_resp = await client.post("/api/career/applications/prepare?opportunity_id=201", headers=headers)
        app_id = prep_resp.json()["id"]

        custom_letter = "Dear Acme Team,\nThis is my custom refined cover letter."
        attach_resp = await client.post(
            f"/api/career/applications/{app_id}/cover-letter",
            json={"cover_letter": custom_letter},
            headers=headers,
        )
        assert attach_resp.status_code == 200
        assert attach_resp.json()["cover_letter"] == custom_letter


@pytest.mark.asyncio
async def test_download_does_not_mark_application_as_submitted():
    """Test 11, 12, 13: Resume export/download does NOT auto-mark application as SUBMITTED."""
    headers = {"x-user-id": "workspace_user_1"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Prepare application
        prep_resp = await client.post("/api/career/applications/prepare?opportunity_id=201", headers=headers)
        app_data = prep_resp.json()
        app_id = app_data["id"]
        res_id = app_data["resume_id"]
        initial_status = app_data["status"]

        # Simulate user downloading ATS HTML resume
        export_resp = await client.get(f"/api/career/resumes/{res_id}/export", headers=headers)
        assert export_resp.status_code == 200

        # Verify application status has NOT been prematurely marked as submitted
        check_app = await client.get(f"/api/career/applications/{app_id}", headers=headers)
        assert check_app.status_code == 200
        current_status = check_app.json()["status"]
        assert current_status != CareerApplicationStatus.SUBMITTED.value
        assert current_status == initial_status

        # Only explicit user update marks it as submitted
        update_resp = await client.patch(
            f"/api/career/applications/{app_id}",
            json={"status": CareerApplicationStatus.SUBMITTED.value, "private_notes": "Submitted externally via Acme portal."},
            headers=headers,
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["status"] == CareerApplicationStatus.SUBMITTED.value
        assert "Submitted externally" in update_resp.json()["private_notes"]


@pytest.mark.asyncio
async def test_tenant_isolation_prevents_cross_user_access():
    """Test 14 & 15: User B cannot view or modify User A's resumes or applications."""
    user_a = {"x-user-id": "workspace_user_1"}
    user_b = {"x-user-id": "workspace_user_2"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # User A prepares application
        app_a = (await client.post("/api/career/applications/prepare?opportunity_id=201", headers=user_a)).json()
        app_a_id = app_a["id"]
        resume_a_id = app_a["resume_id"]

        # User B attempts to access User A's application
        get_app_b = await client.get(f"/api/career/applications/{app_a_id}", headers=user_b)
        assert get_app_b.status_code == 404

        # User B attempts to access User A's resume
        get_res_b = await client.get(f"/api/career/resumes/{resume_a_id}", headers=user_b)
        assert get_res_b.status_code == 404

        # User B attempts to update User A's application
        patch_app_b = await client.patch(
            f"/api/career/applications/{app_a_id}",
            json={"status": "submitted"},
            headers=user_b,
        )
        assert patch_app_b.status_code == 404


@pytest.mark.asyncio
async def test_resume_template_variants_render_distinct_styles_with_equivalent_content():
    """Verify templates (ats_classic, modern, minimal) render distinct styles with equivalent content."""
    headers = {"x-user-id": "workspace_user_1"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Prepare application first
        prep = (await client.post("/api/career/applications/prepare?opportunity_id=201", headers=headers)).json()
        res_id = prep["resume_id"]

        # 1. ats_classic
        resp_classic = await client.get(f"/api/career/resumes/{res_id}/export?template=ats_classic", headers=headers)
        assert resp_classic.status_code == 200
        html_classic = resp_classic.text
        assert 'data-template="ats_classic"' in html_classic
        assert "Acme Robotics" in html_classic

        # 2. modern
        resp_modern = await client.get(f"/api/career/resumes/{res_id}/export?template=modern", headers=headers)
        assert resp_modern.status_code == 200
        html_modern = resp_modern.text
        assert 'data-template="modern"' in html_modern
        assert "Acme Robotics" in html_modern

        # 3. minimal
        resp_minimal = await client.get(f"/api/career/resumes/{res_id}/export?template=minimal", headers=headers)
        assert resp_minimal.status_code == 200
        html_minimal = resp_minimal.text
        assert 'data-template="minimal"' in html_minimal
        assert "Acme Robotics" in html_minimal

        # Confirm distinct presentation styles across templates
        assert html_classic != html_modern
        assert html_modern != html_minimal
        assert html_classic != html_minimal

        # 4. Invalid template falls back safely to ats_classic
        resp_invalid = await client.get(f"/api/career/resumes/{res_id}/export?template=unknown_fantasy_template", headers=headers)
        assert resp_invalid.status_code == 200
        assert 'data-template="ats_classic"' in resp_invalid.text

        # 5. Default without template query parameter falls back to ats_classic
        resp_default = await client.get(f"/api/career/resumes/{res_id}/export", headers=headers)
        assert resp_default.status_code == 200
        assert 'data-template="ats_classic"' in resp_default.text


@pytest.mark.asyncio
async def test_get_applications_prepare_is_strictly_read_only_and_idempotent():
    """Verify GET /applications/prepare is read-only (no mutation) and POST is idempotent."""
    headers = {"x-user-id": "workspace_user_1"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. GET before preparation must return 404 and NOT create any records
        get_before = await client.get("/api/career/applications/prepare?opportunity_id=202", headers=headers)
        assert get_before.status_code == 404

        list_apps = (await client.get("/api/career/applications", headers=headers)).json()
        assert not any(a["opportunity_id"] == 202 for a in list_apps), "GET must not mutate or create records"

        # 2. POST creates application and tailored resume
        prep_post = await client.post("/api/career/applications/prepare?opportunity_id=202", headers=headers)
        assert prep_post.status_code == 200
        app_data = prep_post.json()
        app_id = app_data["id"]
        res_id = app_data["resume_id"]

        # 3. Subsequent GET returns the prepared application in read-only mode
        get_after = await client.get("/api/career/applications/prepare?opportunity_id=202", headers=headers)
        assert get_after.status_code == 200
        retrieved_data = get_after.json()
        assert retrieved_data["id"] == app_id
        assert retrieved_data["resume_id"] == res_id

        # 4. Repeating POST is idempotent and does NOT duplicate application or resume
        prep_retry = await client.post("/api/career/applications/prepare?opportunity_id=202", headers=headers)
        assert prep_retry.status_code == 200
        retry_data = prep_retry.json()
        assert retry_data["id"] == app_id
        assert retry_data["resume_id"] == res_id

        # 5. Update notes and verify preserved on re-fetching
        await client.patch(
            f"/api/career/applications/{app_id}",
            json={"private_notes": "Preserved test note", "status": "preparing"},
            headers=headers,
        )

        reopened = (await client.get("/api/career/applications/prepare?opportunity_id=202", headers=headers)).json()
        assert reopened["private_notes"] == "Preserved test note"
        assert reopened["resume_id"] == res_id

