import pytest
import io
import zipfile
from fastapi.testclient import TestClient
from backend.main import app
from backend.dependencies import generate_guest_token
from backend.services.career_resume import (
    build_default_master_from_profile,
    validate_resume_against_master,
)
from backend.models_career import ResumeContent, ResumeEducationItem, ResumeProjectItem

client = TestClient(app)


def test_export_without_auth_returns_401():
    """Top-level requests without any authentication or guest token must be rejected with 401."""
    # 1. HTML export without auth
    resp_html = client.get("/api/career/resumes/1/export/html")
    assert resp_html.status_code == 401
    assert resp_html.json()["detail"] == "Authentication or valid guest token required"

    # 2. DOCX export without auth
    resp_docx = client.get("/api/career/resumes/1/export/docx")
    assert resp_docx.status_code == 401
    assert resp_docx.json()["detail"] == "Authentication or valid guest token required"


def test_new_master_has_empty_fields_and_blocks_export():
    """New master resume has empty fields and blocks export with descriptive error."""
    gid, token = generate_guest_token()
    headers = {"x-guest-token": token}

    resp_master = client.get("/api/career/resumes/master", headers=headers)
    assert resp_master.status_code == 200
    res_data = resp_master.json()
    res_id = res_data["id"]
    content = res_data["content"]

    # Must NOT have fabricated default placeholder data
    assert content["full_name"] == ""
    assert content["email"] == ""
    assert len(content["projects"]) == 0

    # Attempting to export an empty/placeholder profile is blocked with 400
    resp_html = client.get(f"/api/career/resumes/{res_id}/export/html", headers=headers)
    assert resp_html.status_code == 400
    assert "Cannot export resume" in resp_html.json()["detail"]
    assert "Candidate Full Name" in resp_html.json()["detail"]
    assert "Candidate Email" in resp_html.json()["detail"]

    resp_docx = client.get(f"/api/career/resumes/{res_id}/export/docx", headers=headers)
    assert resp_docx.status_code == 400
    assert "Cannot export resume" in resp_docx.json()["detail"]


def test_export_with_real_data_returns_200_and_valid_structure():
    """Exporting a resume with valid candidate profile succeeds with 200, CSP, and valid OpenXML."""
    gid, token = generate_guest_token()
    headers = {"x-guest-token": token}

    resp_master = client.get("/api/career/resumes/master", headers=headers)
    assert resp_master.status_code == 200
    res_id = resp_master.json()["id"]

    # Fill in real candidate data
    update_payload = {
        "full_name": "Aarav Sharma",
        "email": "aarav.sharma@example.edu",
        "phone": "+91 98765 43210",
        "location": "Bengaluru, India",
        "summary": "Full stack engineer specializing in distributed systems and cloud platforms.",
        "skills": ["Python", "FastAPI", "React", "PostgreSQL", "Docker"],
        "education": [
            {
                "institution": "National Institute of Technology",
                "degree": "B.Tech in Computer Science",
                "field_of_study": "Computer Science",
                "start_year": 2021,
                "end_year": 2025,
                "cgpa_or_grade": "8.9/10",
            }
        ],
        "projects": [
            {
                "title": "Cloud Scale Observability Pipeline",
                "description": "Engineered real-time telemetry ingestion pipeline processing events with sub-second latency.",
                "technologies": ["Python", "FastAPI", "PostgreSQL"],
                "highlights": [
                    "Implemented asynchronous consumer threads increasing throughput by 40%",
                    "Built ATS-compliant export services with strict security policies",
                ],
            }
        ],
        "experience": [],
        "achievements": ["1st place NIT Hackathon 2024"],
        "github_or_portfolio": "https://github.com/aaravsharma",
        "linkedin_url": "https://linkedin.com/in/aaravsharma",
    }
    resp_update = client.put("/api/career/resumes/master", json=update_payload, headers=headers)
    assert resp_update.status_code == 200

    # 1. HTML Export with different templates
    for tpl in ["ats_classic", "modern", "minimal"]:
        resp_html = client.get(f"/api/career/resumes/{res_id}/export/html?template={tpl}", headers=headers)
        assert resp_html.status_code == 200
        assert f"resume-template-{tpl}" in resp_html.text
        assert resp_html.headers["content-type"].startswith("text/html")
        # Check CSP Header
        assert "default-src 'none'" in resp_html.headers.get("content-security-policy", "")
        # Check CSP Meta tag in body
        assert "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'" in resp_html.text
        # Check candidate data rendered
        assert "Aarav Sharma" in resp_html.text
        assert "aarav.sharma@example.edu" in resp_html.text
        assert "Cloud Scale Observability Pipeline" in resp_html.text

    # 2. DOCX Export
    resp_docx = client.get(f"/api/career/resumes/{res_id}/export/docx", headers=headers)
    assert resp_docx.status_code == 200
    assert resp_docx.headers["content-type"] == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert "attachment; filename=" in resp_docx.headers.get("content-disposition", "")
    assert len(resp_docx.content) > 1000

    # Verify DOCX zip structure signature
    with zipfile.ZipFile(io.BytesIO(resp_docx.content)) as z:
        names = z.namelist()
        assert "word/document.xml" in names
        assert "[Content_Types].xml" in names


def test_export_html_escapes_xss_and_validates_links():
    """Verify EVERY interpolated field is HTML-escaped and malicious link schemes are neutralized."""
    gid, token = generate_guest_token()
    headers = {"x-guest-token": token}

    client.get("/api/career/resumes/master", headers=headers)

    xss_payload = {
        "full_name": "<script>alert('xss-name')</script>Candidate",
        "email": "test<img onerror=alert('xss-email') src=x>@example.com",
        "phone": "<script>evilPhone()</script>",
        "location": "<h1>EvilLocation</h1>",
        "summary": "Summary with <script>evilSummary()</script> and <b onmouseover=evil()>bold</b>",
        "skills": ["<script>evilSkill()</script>", "<img src=x onerror=alert('skill')>"],
        "education": [
            {
                "institution": "<script>evilUni()</script>",
                "degree": "<script>evilDeg()</script>",
                "field_of_study": "<script>evilField()</script>",
                "start_year": 2020,
                "end_year": 2024,
                "cgpa_or_grade": "9.0<script>",
            }
        ],
        "projects": [
            {
                "title": "<script>alert('proj-title')</script>",
                "description": "<img src=x onerror=alert('proj-desc')>",
                "technologies": ["<script>tech()</script>"],
                "highlights": ["<script>highlight()</script>"],
            }
        ],
        "experience": [
            {
                "company": "<script>alert('exp-comp')</script>",
                "role_title": "<script>alert('exp-role')</script>",
                "highlights": ["<script>exp-highlight()</script>"],
            }
        ],
        "achievements": ["<script>alert('achievement')</script>"],
        "github_or_portfolio": "javascript:alert('xss-link')",
        "linkedin_url": "https://linkedin.com/in/safe-profile?param=1&foo=bar",
    }

    resp_update = client.put("/api/career/resumes/master", json=xss_payload, headers=headers)
    assert resp_update.status_code == 200
    res_id = resp_update.json()["id"]

    resp_html = client.get(f"/api/career/resumes/{res_id}/export/html", headers=headers)
    assert resp_html.status_code == 200
    html_text = resp_html.text

    # None of the unescaped script, img, or dangerous tag tokens should exist
    assert "<script" not in html_text
    assert "</script" not in html_text
    assert "<img" not in html_text
    assert "<b " not in html_text
    assert 'href="javascript:' not in html_text

    # Escaped representations MUST exist
    assert "&lt;script&gt;alert(&#x27;xss-name&#x27;)&lt;/script&gt;" in html_text or "&lt;script&gt;alert('xss-name')&lt;/script&gt;" in html_text
    assert "&lt;img" in html_text

    # Valid link with https is preserved and escaped
    assert 'href="https://linkedin.com/in/safe-profile?param=1&amp;foo=bar"' in html_text or 'href="https://linkedin.com/in/safe-profile?param=1&foo=bar"' in html_text

    # DOCX export must also handle special characters safely without XML parsing failure
    resp_docx = client.get(f"/api/career/resumes/{res_id}/export/docx", headers=headers)
    assert resp_docx.status_code == 200
    with zipfile.ZipFile(io.BytesIO(resp_docx.content)) as z:
        doc_xml = z.read("word/document.xml").decode("utf-8")
        # Ensure XML is well-formed (no unescaped < inside text runs)
        assert "<script>" not in doc_xml


def test_other_tenant_cannot_export_resume_returns_404():
    """Tenant isolation: Guest B cannot access or export Guest A's resume."""
    gid_a, tok_a = generate_guest_token()
    gid_b, tok_b = generate_guest_token()

    # Create & populate master resume for Tenant A
    resp_a = client.get("/api/career/resumes/master", headers={"x-guest-token": tok_a})
    assert resp_a.status_code == 200
    resume_a_id = resp_a.json()["id"]

    client.put("/api/career/resumes/master", json={
        "full_name": "Tenant A User",
        "email": "tenanta@example.com",
    }, headers={"x-guest-token": tok_a})

    # Tenant B attempts to export Tenant A's resume
    resp_b_html = client.get(f"/api/career/resumes/{resume_a_id}/export/html", headers={"x-guest-token": tok_b})
    assert resp_b_html.status_code == 404
    assert resp_b_html.json()["detail"] == "Resume not found"

    resp_b_docx = client.get(f"/api/career/resumes/{resume_a_id}/export/docx", headers={"x-guest-token": tok_b})
    assert resp_b_docx.status_code == 404
    assert resp_b_docx.json()["detail"] == "Resume not found"


def test_calendar_export_auth_and_isolation():
    """Calendar .ics export requires auth, ignores ?user_id= query param, and isolates events across tenants."""
    # 1. Unauthed request -> 401
    resp_unauthed = client.get("/api/calendar/export.ics")
    assert resp_unauthed.status_code == 401
    assert resp_unauthed.json()["detail"] == "Authentication or valid guest token required"

    # 2. Authed Tenant A creates a private task
    gid_a, token_a = generate_guest_token()
    headers_a = {"x-guest-token": token_a}

    task_payload = {
        "title": "Confidential Tenant A Strategy Meeting",
        "domain": "general",
        "due_date": "2026-11-15",
    }
    resp_create = client.post("/api/tasks", json=task_payload, headers=headers_a)
    assert resp_create.status_code in (200, 201)

    # Tenant A exports .ics -> sees their event
    resp_a_ics = client.get("/api/calendar/export.ics", headers=headers_a)
    assert resp_a_ics.status_code == 200
    assert "text/calendar" in resp_a_ics.headers["content-type"]
    assert "Confidential Tenant A Strategy Meeting" in resp_a_ics.text

    # 3. Tenant B exports .ics -> NEVER sees Tenant A's event
    gid_b, token_b = generate_guest_token()
    headers_b = {"x-guest-token": token_b}

    resp_b_ics = client.get("/api/calendar/export.ics", headers=headers_b)
    assert resp_b_ics.status_code == 200
    assert "Confidential Tenant A Strategy Meeting" not in resp_b_ics.text

    # 4. Tenant B attempts to spoof user_id=?user_id=<gid_a> -> ignored, still isolated
    resp_b_spoofed = client.get(f"/api/calendar/export.ics?user_id={gid_a}", headers=headers_b)
    assert resp_b_spoofed.status_code == 200
    assert "Confidential Tenant A Strategy Meeting" not in resp_b_spoofed.text



def test_audit_badge_states():
    """Verify validate_resume_against_master returns NOT ENOUGH DATA for sparse profiles and honest statuses."""
    # 1. Sparse profile -> NOT ENOUGH DATA
    sparse_master = ResumeContent(
        full_name="",
        email="",
        skills=["Python"],
    )
    tailored = ResumeContent(
        full_name="Candidate",
        email="candidate@example.com",
        skills=["Python"],
    )
    report_sparse = validate_resume_against_master(tailored, sparse_master)
    assert report_sparse.status == "NOT ENOUGH DATA"

    # 2. Rich consistent profile -> CONSISTENT WITH MASTER
    rich_master = ResumeContent(
        full_name="Aarav Sharma",
        email="aarav@example.edu",
        summary="Experienced engineer with backend skills.",
        skills=["Python", "FastAPI", "Docker", "PostgreSQL"],
        education=[ResumeEducationItem(institution="NIT", degree="B.Tech")],
        projects=[ResumeProjectItem(title="Cloud Pipeline", description="Scalable pipeline", technologies=["Python"])],
    )
    rich_tailored = ResumeContent(
        full_name="Aarav Sharma",
        email="aarav@example.edu",
        summary="Experienced engineer with backend skills.",
        skills=["Python", "FastAPI"],
        education=[ResumeEducationItem(institution="NIT", degree="B.Tech")],
        projects=[ResumeProjectItem(title="Cloud Pipeline", description="Scalable pipeline", technologies=["Python"])],
    )
    report_consistent = validate_resume_against_master(rich_tailored, rich_master)
    assert report_consistent.status == "CONSISTENT WITH MASTER"
    assert report_consistent.is_valid is True

    # 3. Inconsistent profile with hallucinated skills -> INCONSISTENT WITH MASTER
    rich_tailored_hallucinated = ResumeContent(
        full_name="Aarav Sharma",
        email="aarav@example.edu",
        skills=["Python", "Quantum Computing", "Fortran"],
        education=[ResumeEducationItem(institution="NIT", degree="B.Tech")],
        projects=[ResumeProjectItem(title="Cloud Pipeline", description="Scalable pipeline", technologies=["Python"])],
    )
    report_inconsistent = validate_resume_against_master(rich_tailored_hallucinated, rich_master)
    assert report_inconsistent.status == "INCONSISTENT WITH MASTER"
    assert report_inconsistent.is_valid is False
    assert any("Quantum Computing" in u for u in report_inconsistent.unsupported_claims)
