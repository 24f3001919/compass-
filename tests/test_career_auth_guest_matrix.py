"""
Compass — Career Authentication & Guest Session Matrix Regression Tests.

Verifies:
1. Career endpoints reject missing authentication with HTTP 401.
2. Raw x-guest-id UUID without cryptographic signature is rejected with HTTP 401.
3. Forged or tampered x-guest-token is rejected with HTTP 401.
4. Valid guest token succeeds on GET /api/career/resumes/master.
5. Valid guest token succeeds on PUT /api/career/resumes/master.
6. Valid guest token succeeds on POST /api/career/resumes/parse-upload.
7. Valid guest token succeeds on POST /api/career/intelligence/github.
8. Valid guest token succeeds on POST /api/career/resumes/tailor and cover-letter draft.
9. Tenant isolation between two distinct guest sessions and authenticated users.
"""

import uuid
import pytest
from httpx import AsyncClient
from backend.dependencies import verify_guest_token
from backend.memory.radar import upsert_opportunity


@pytest.mark.asyncio
async def test_career_rejects_missing_auth(client: AsyncClient):
    """Anonymous request without any session token or guest credentials is rejected."""
    resp = await client.get("/api/career/resumes/master")
    assert resp.status_code == 401
    assert "Authentication or valid guest token required" in resp.json().get("detail", "")


@pytest.mark.asyncio
async def test_career_rejects_raw_uuid_without_signature(client: AsyncClient):
    """Sending a raw UUID in x-guest-id without a cryptographic signature returns HTTP 401."""
    raw_uuid = str(uuid.uuid4())
    resp = await client.get(
        "/api/career/resumes/master",
        headers={"x-guest-id": raw_uuid},
    )
    assert resp.status_code == 401
    assert "Authentication or valid guest token required" in resp.json().get("detail", "")


@pytest.mark.asyncio
async def test_career_rejects_tampered_guest_token(client: AsyncClient):
    """Sending an invalid or tampered signature in x-guest-token returns HTTP 401."""
    raw_uuid = str(uuid.uuid4())
    fake_token = f"{raw_uuid}.1792433000.tampered_signature_hex_value_0000"
    resp = await client.get(
        "/api/career/resumes/master",
        headers={"x-guest-token": fake_token},
    )
    assert resp.status_code == 401
    assert "Authentication or valid guest token required" in resp.json().get("detail", "")


@pytest.mark.asyncio
async def test_career_valid_guest_session_master_flow(client: AsyncClient):
    """Minting a valid guest session allows GET and PUT operations on master resume."""
    # 1. Mint real signed guest session
    mint_resp = await client.post("/api/guest/session")
    assert mint_resp.status_code == 200
    guest_data = mint_resp.json()
    guest_token = guest_data["guest_token"]
    guest_id = guest_data["guest_id"]
    assert verify_guest_token(guest_token) == guest_id

    guest_headers = {"x-guest-token": guest_token}

    # 2. GET master resume with guest token
    get_resp = await client.get("/api/career/resumes/master", headers=guest_headers)
    assert get_resp.status_code == 200
    master = get_resp.json()
    assert master["is_master"] is True
    assert master["user_id"] == guest_id

    # 3. PUT updated master resume
    content = master["content"]
    content["full_name"] = "Synthetic Guest Candidate"
    content["summary"] = "Experienced backend and distributed systems engineer"
    content["skills"] = ["Python", "FastAPI", "PostgreSQL", "Docker"]

    put_resp = await client.put(
        "/api/career/resumes/master",
        headers=guest_headers,
        json=content,
    )
    assert put_resp.status_code == 200
    updated = put_resp.json()
    assert updated["content"]["full_name"] == "Synthetic Guest Candidate"
    assert "FastAPI" in updated["content"]["skills"]

    # 4. Re-fetch master resume to confirm persistence
    refetch = await client.get("/api/career/resumes/master", headers=guest_headers)
    assert refetch.status_code == 200
    assert refetch.json()["content"]["full_name"] == "Synthetic Guest Candidate"


@pytest.mark.asyncio
async def test_career_parse_upload_flow_with_guest_token(client: AsyncClient):
    """Valid guest session can parse raw resume text into structured fields."""
    mint_resp = await client.post("/api/guest/session")
    assert mint_resp.status_code == 200
    guest_token = mint_resp.json()["guest_token"]

    raw_resume = (
        "Alex Chen\n"
        "Email: alex.chen@example.com\n"
        "Summary: AI and Systems Engineer\n"
        "Skills: Python, TypeScript, React, PyTorch\n"
        "Experience:\n"
        "Senior Software Engineer at Horizon Labs (2023 - Present)\n"
        "- Built real-time inference microservices with FastAPI and Triton\n"
    )

    resp = await client.post(
        "/api/career/resumes/parse-upload",
        headers={"x-guest-token": guest_token},
        json={"raw_text": raw_resume},
    )
    assert resp.status_code == 200
    parsed = resp.json()
    assert parsed["full_name"] == "Alex Chen"
    assert "Python" in parsed["skills"]


@pytest.mark.asyncio
async def test_career_github_intelligence_with_guest_token(client: AsyncClient):
    """Valid guest session can invoke GitHub profile intelligence."""
    mint_resp = await client.post("/api/guest/session")
    assert mint_resp.status_code == 200
    guest_token = mint_resp.json()["guest_token"]

    resp = await client.post(
        "/api/career/intelligence/github",
        headers={"x-guest-token": guest_token},
        json={"username_or_url": "testcandidate", "excluded_repos": []},
    )
    assert resp.status_code == 200
    intel = resp.json()
    assert intel["username"] == "testcandidate"
    assert "detected_skills" in intel
    assert "analyzed_repos" in intel


@pytest.mark.asyncio
async def test_career_tailoring_and_cover_letter_with_guest_token(client: AsyncClient):
    """Valid guest session can tailor a resume and generate a cover letter for an opportunity."""
    mint_resp = await client.post("/api/guest/session")
    assert mint_resp.status_code == 200
    guest_token = mint_resp.json()["guest_token"]
    guest_id = mint_resp.json()["guest_id"]
    headers = {"x-guest-token": guest_token}

    # Seed target opportunity
    opp_id = await upsert_opportunity(
        "CloudScale Systems",
        "Backend Engineering Intern",
        "https://cloudscale.test/careers/intern-1",
    )

    # 1. Tailor Resume
    tailor_resp = await client.post(
        "/api/career/resumes/tailor",
        headers=headers,
        json={"opportunity_id": opp_id, "custom_title": "Cloud Backend Intern"},
    )
    assert tailor_resp.status_code == 200
    tailored = tailor_resp.json()
    assert tailored["is_master"] is False
    assert tailored["opportunity_id"] == opp_id

    # 2. Draft Cover Letter
    cl_resp = await client.post(
        "/api/career/cover-letters/draft",
        headers=headers,
        json={"opportunity_id": opp_id},
    )
    assert cl_resp.status_code == 200
    cover_letter = cl_resp.json()
    assert cover_letter["opportunity_id"] == opp_id
    assert cover_letter["company_name"] == "CloudScale Systems"
    assert len(cover_letter["content"]) > 0


@pytest.mark.asyncio
async def test_career_guest_tenant_isolation(client: AsyncClient):
    """Two different guest sessions maintain isolated master and tailored resumes."""
    # Guest A
    mint_a = await client.post("/api/guest/session")
    token_a = mint_a.json()["guest_token"]

    # Guest B
    mint_b = await client.post("/api/guest/session")
    token_b = mint_b.json()["guest_token"]

    # Guest A updates master
    master_a = (await client.get("/api/career/resumes/master", headers={"x-guest-token": token_a})).json()
    content_a = master_a["content"]
    content_a["full_name"] = "Candidate Alpha"
    await client.put("/api/career/resumes/master", headers={"x-guest-token": token_a}, json=content_a)

    # Guest B updates master
    master_b = (await client.get("/api/career/resumes/master", headers={"x-guest-token": token_b})).json()
    content_b = master_b["content"]
    content_b["full_name"] = "Candidate Beta"
    await client.put("/api/career/resumes/master", headers={"x-guest-token": token_b}, json=content_b)

    # Verify Guest A still sees Candidate Alpha
    check_a = await client.get("/api/career/resumes/master", headers={"x-guest-token": token_a})
    assert check_a.json()["content"]["full_name"] == "Candidate Alpha"

    # Verify Guest B still sees Candidate Beta
    check_b = await client.get("/api/career/resumes/master", headers={"x-guest-token": token_b})
    assert check_b.json()["content"]["full_name"] == "Candidate Beta"


@pytest.mark.asyncio
async def test_career_multipart_file_upload_with_guest_token(client: AsyncClient):
    """Guest session can upload multipart resume file, extract fields, and commit to master."""
    mint_resp = await client.post("/api/guest/session")
    assert mint_resp.status_code == 200
    guest_token = mint_resp.json()["guest_token"]
    headers = {"x-guest-token": guest_token}

    synthetic_resume_text = (
        "Taylor Swift\n"
        "Email: taylor@example.com\n"
        "Summary: Senior Distributed Systems Architect\n"
        "Skills: Go, Kubernetes, Rust, gRPC, Distributed Consensus\n"
        "Experience:\n"
        "Staff Engineer at CloudScale (2021 - Present)\n"
        "- Architected high-throughput Raft consensus layer\n"
    )

    files = {
        "file": ("synthetic_resume.txt", synthetic_resume_text.encode("utf-8"), "text/plain")
    }

    resp = await client.post(
        "/api/career/resumes/parse-file",
        headers=headers,
        files=files,
    )
    assert resp.status_code == 200
    parsed = resp.json()
    assert parsed["success"] is True
    assert parsed["extracted_content"]["full_name"] == "Taylor Swift"
    assert len(parsed["extracted_content"]["skills"]) > 0
    assert parsed["original_document_id"] is not None

    # Commit extracted resume to master
    commit_resp = await client.post(
        "/api/career/resumes/commit-extracted",
        headers=headers,
        json={
            "content": parsed["extracted_content"],
            "original_document_id": parsed["original_document_id"],
            "target": "master",
        },
    )
    assert commit_resp.status_code == 200
    master = commit_resp.json()
    assert master["content"]["full_name"] == "Taylor Swift"


@pytest.mark.asyncio
async def test_career_cookie_guest_authentication_and_export(client: AsyncClient):
    """Session cookie alone (without x-guest-token header) authenticates guest requests and export endpoints."""
    # 1. Mint guest session (sets compass_guest_token cookie on the client)
    mint_resp = await client.post("/api/guest/session")
    assert mint_resp.status_code == 200
    guest_id = mint_resp.json()["guest_id"]

    # 2. GET master resume using ONLY cookies (no custom auth headers)
    get_resp = await client.get("/api/career/resumes/master")
    assert get_resp.status_code == 200
    master = get_resp.json()
    assert master["user_id"] == guest_id
    resume_id = master["id"]

    # Populate required profile fields via cookie to satisfy empty profile export guard
    update_resp = await client.put(
        "/api/career/resumes/master",
        json={
            "full_name": "Aarav Sharma",
            "email": "aarav.sharma@example.edu",
            "phone": "+91 98765 43210",
            "location": "Bengaluru, India",
            "summary": "Full stack engineer specializing in distributed systems.",
            "skills": ["Python", "FastAPI", "React", "PostgreSQL"],
        },
    )
    assert update_resp.status_code == 200

    # 3. GET HTML export using cookie
    html_resp = await client.get(f"/api/career/resumes/{resume_id}/export/html")
    assert html_resp.status_code == 200
    assert "text/html" in html_resp.headers.get("content-type", "")
    assert "<!DOCTYPE html>" in html_resp.text

    # 4. GET DOCX export using cookie
    docx_resp = await client.get(f"/api/career/resumes/{resume_id}/export/docx")
    assert docx_resp.status_code == 200
    assert "application/vnd.openxmlformats-officedocument.wordprocessingml.document" in docx_resp.headers.get("content-type", "")
    assert len(docx_resp.content) > 100


@pytest.mark.asyncio
async def test_career_authenticated_session_cookie(client: AsyncClient):
    """Authenticated user session cookie (compass_session) authenticates career requests."""
    from backend.routers.auth import create_session

    user_email = "test.verified.user@compass.app"
    sess_token = create_session(user_email, oauth_verified=True)

    # Set cookie on client
    client.cookies.set("compass_session", sess_token)

    # Make request with session cookie
    resp = await client.get("/api/career/resumes/master")
    assert resp.status_code == 200
    master = resp.json()
    assert master["user_id"] == user_email


