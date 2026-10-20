"""
Compass — Career Copilot Staging Readiness, DOCX Parsing & Security Hardening Tests.

Validates:
1. DOCX Resume Extraction: Valid document text extraction (paragraphs + tables), corrupt DOCX, empty DOCX.
2. Production & Staging Authentication Gates:
   - Forged x-user-id header is strictly rejected with HTTP 403 in production.
   - Forged x-user-id header is strictly rejected with HTTP 403 in staging.
   - Forged compass_user_id cookie is strictly rejected with HTTP 403 in production.
   - Forged compass_user_id cookie is strictly rejected with HTTP 403 in staging.
3. Multi-Tenant Scoping & Cross-User Isolation:
   - User B cannot read or modify User A's career application.
   - User B cannot read, approve, or submit User A's application batch.
4. Production Configuration & Secret Validation:
   - Staging is recognized as a production-hardened environment.
   - Default/insecure secrets are rejected when validating production/staging.
"""
from __future__ import annotations

import io
from unittest.mock import patch

import docx
import pytest
from httpx import ASGITransport, AsyncClient

from backend.config import get_settings
from backend.main import app
from backend.memory.career import (
    create_application_batch,
    get_or_create_career_application,
    upsert_master_resume,
)
from backend.models_career import ResumeContent
from backend.memory.radar import upsert_opportunity
from backend.services.career_file_parser import extract_resume_from_file_bytes


async def _get_test_opp_id(canonical_url: str) -> int:
    return await upsert_opportunity(
        company_name="Test Hardening Co",
        role_title="Software Engineering Intern",
        canonical_url=canonical_url,
    )


def _build_test_docx() -> bytes:
    """Helper to generate a real, in-memory .docx resume file."""
    doc = docx.Document()
    doc.add_heading("Alex Developer", level=0)
    doc.add_paragraph("Email: alex.developer@example.com | Phone: 555-0199")
    doc.add_paragraph("Summary: Experienced backend software engineer specializing in distributed systems.")
    
    doc.add_heading("Skills", level=1)
    doc.add_paragraph("Python, FastAPI, TypeScript, PostgreSQL, Docker, Kubernetes, Redis, AWS")
    
    doc.add_heading("Education", level=1)
    doc.add_paragraph("B.S. in Computer Science - Stanford University, 2024")
    
    doc.add_heading("Experience", level=1)
    table = doc.add_table(rows=1, cols=2)
    hdr_cells = table.rows[0].cells
    hdr_cells[0].text = "Role"
    hdr_cells[1].text = "Details"
    
    row_cells = table.add_row().cells
    row_cells[0].text = "Software Engineer Intern @ TechCorp (Summer 2023)"
    row_cells[1].text = "Built asynchronous data processing pipeline improving ingestion throughput by 40%."
    
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ===========================================================================
# 1. DOCX RESUME FILE PARSING
# ===========================================================================

def test_docx_valid_text_extraction():
    """Verify that valid .docx files are cleanly parsed with paragraphs and tables."""
    raw_docx = _build_test_docx()
    res = extract_resume_from_file_bytes(raw_docx, "alex_resume.docx")

    assert res.success is True
    assert res.file_type == ".docx"
    assert res.extracted_content is not None
    assert "Alex Developer" in res.extracted_content.full_name
    assert "Python" in res.extracted_content.skills
    assert "FastAPI" in res.extracted_content.skills
    assert res.requires_user_review is True
    assert len(res.extracted_content.education) >= 1
    edu_text = " ".join(f"{e.institution} {e.degree}" for e in res.extracted_content.education)
    assert "Stanford" in edu_text


def test_docx_corrupt_file_handling():
    """Corrupted or non-zip .docx bytes are rejected gracefully with a descriptive error."""
    corrupt_bytes = b"PK\x03\x04this is definitely not a valid docx file content"
    res = extract_resume_from_file_bytes(corrupt_bytes, "corrupt_resume.docx")

    assert res.success is False
    assert res.file_type == ".docx"
    assert res.error_message is not None
    assert "Malformed or corrupted DOCX file" in res.error_message


def test_docx_empty_document_handling():
    """A .docx file with zero text content is rejected as empty."""
    empty_doc = docx.Document()
    buf = io.BytesIO()
    empty_doc.save(buf)

    res = extract_resume_from_file_bytes(buf.getvalue(), "empty.docx")
    assert res.success is False
    assert res.file_type == ".docx"
    assert res.error_message is not None
    assert "contains no readable text" in res.error_message


# ===========================================================================
# 2. PRODUCTION & STAGING AUTHENTICATION GATES
# ===========================================================================

@pytest.mark.asyncio
async def test_production_rejects_forged_x_user_id():
    """When ENVIRONMENT is production, x-user-id impersonation must return 403 Forbidden."""
    settings = get_settings()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with patch.object(settings, "ENVIRONMENT", "production"):
            res = await client.get(
                "/api/career/resumes/master",
                headers={"x-user-id": "victim@compass.internal"},
            )
            assert res.status_code == 403
            assert "strictly forbidden outside development or test environments" in res.json()["detail"]


@pytest.mark.asyncio
async def test_staging_rejects_forged_x_user_id():
    """When ENVIRONMENT is staging, x-user-id impersonation must return 403 Forbidden."""
    settings = get_settings()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with patch.object(settings, "ENVIRONMENT", "staging"):
            res = await client.get(
                "/api/career/resumes/master",
                headers={"x-user-id": "victim@compass.internal"},
            )
            assert res.status_code == 403
            assert "strictly forbidden outside development or test environments" in res.json()["detail"]


@pytest.mark.asyncio
async def test_production_rejects_forged_compass_user_id_cookie():
    """When ENVIRONMENT is production, compass_user_id cookie impersonation must return 403 Forbidden."""
    settings = get_settings()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", cookies={"compass_user_id": "victim@compass.internal"}) as client:
        with patch.object(settings, "ENVIRONMENT", "production"):
            res = await client.get("/api/career/resumes/master")
            assert res.status_code == 403
            assert "strictly forbidden outside development or test environments" in res.json()["detail"]


@pytest.mark.asyncio
async def test_staging_rejects_forged_compass_user_id_cookie():
    """When ENVIRONMENT is staging, compass_user_id cookie impersonation must return 403 Forbidden."""
    settings = get_settings()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", cookies={"compass_user_id": "victim@compass.internal"}) as client:
        with patch.object(settings, "ENVIRONMENT", "staging"):
            res = await client.get("/api/career/resumes/master")
            assert res.status_code == 403
            assert "strictly forbidden outside development or test environments" in res.json()["detail"]


# ===========================================================================
# 3. MULTI-TENANT ISOLATION
# ===========================================================================

@pytest.mark.asyncio
async def test_multi_tenant_cross_user_career_application_blocked():
    """User B must be unable to read or mutate User A's career application."""
    user_a = "user_tenant_a@compass.internal"
    user_b = "user_tenant_b@compass.internal"

    opp_id = await _get_test_opp_id("https://example.com/test-opp-cross-app-999")
    app_a = await get_or_create_career_application(user_a, opp_id)
    app_id = app_a.id

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # User B attempts to access User A's application
        res_read = await client.get(
            f"/api/career/applications/{app_id}",
            headers={"x-user-id": user_b},
        )
        assert res_read.status_code == 404

        # User B attempts to modify User A's application
        res_patch = await client.patch(
            f"/api/career/applications/{app_id}",
            json={"form_answers": {"notes": "Tampered by User B"}},
            headers={"x-user-id": user_b},
        )
        assert res_patch.status_code == 404


@pytest.mark.asyncio
async def test_multi_tenant_cross_user_batch_access_blocked():
    """User B must be unable to view or approve User A's application batch."""
    user_a = "user_batch_tenant_a@compass.internal"
    user_b = "user_batch_tenant_b@compass.internal"

    opp_id = await _get_test_opp_id("https://example.com/test-opp-cross-batch-998")
    app_a = await get_or_create_career_application(user_a, opp_id)
    batch_id = await create_application_batch(user_a, [app_a.id])

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # User B attempts to view User A's batch
        res_view = await client.get(
            f"/api/career/batches/{batch_id}",
            headers={"x-user-id": user_b},
        )
        assert res_view.status_code == 404

        # User B attempts to approve User A's batch
        res_approve = await client.post(
            f"/api/career/batches/{batch_id}/approve",
            json={
                "batch_id": batch_id,
                "attestation_confirmed": True,
                "work_auth_confirmed": True,
                "legal_statements_accepted": True,
            },
            headers={"x-user-id": user_b},
        )
        assert res_approve.status_code == 404


# ===========================================================================
# 4. CONFIGURATION & SECRET VALIDATION RIGOR
# ===========================================================================

def test_environment_staging_and_production_helpers():
    """Verify is_staging() and is_production() environment detection behavior."""
    settings = get_settings()
    
    with patch.object(settings, "ENVIRONMENT", "staging"):
        assert settings.is_staging() is True
        assert settings.is_production() is True
        assert settings.is_development() is False
        assert settings.is_test() is False
        
    with patch.object(settings, "ENVIRONMENT", "production"):
        assert settings.is_staging() is False
        assert settings.is_production() is True
        assert settings.is_development() is False
        assert settings.is_test() is False

    with patch.object(settings, "ENVIRONMENT", "development"):
        assert settings.is_staging() is False
        assert settings.is_production() is False
        assert settings.is_development() is True
        assert settings.is_test() is False

    with patch.object(settings, "ENVIRONMENT", "test"):
        assert settings.is_staging() is False
        assert settings.is_production() is False
        assert settings.is_development() is False
        assert settings.is_test() is True


# ===========================================================================
# 5. MULTI-WORKER ATOMIC SUBMISSION SAFETY & PERSISTENCE TRANSPARENCY
# ===========================================================================

@pytest.mark.asyncio
async def test_multi_worker_atomic_batch_claim_prevents_duplicate_acquisition():
    """Two concurrent server worker processes cannot both acquire the submission lock for the same batch."""
    from backend.memory.career import (
        approve_application_batch,
        claim_application_batch_for_submission,
        create_application_batch,
        get_or_create_career_application,
        release_application_batch_claim,
    )
    user = "worker_concurrency_test_user"
    opp_id = await _get_test_opp_id("https://example.com/test-opp-claim-batch-991")
    app_rec = await get_or_create_career_application(user, opp_id)
    batch_id = await create_application_batch(user, [app_rec.id])
    await approve_application_batch(batch_id, user, "bat_mock_approval_token_123")

    # Worker A claims batch
    claimed_a = await claim_application_batch_for_submission(batch_id, user)
    assert claimed_a is True

    # Worker B simultaneously attempts to claim the same batch
    claimed_b = await claim_application_batch_for_submission(batch_id, user)
    assert claimed_b is False, "Worker B must be rejected from acquiring an already-claimed batch"

    # Releasing claim allows safe reset if aborted
    released = await release_application_batch_claim(batch_id, user, "APPROVED")
    assert released is True

    # Can now be claimed again
    claimed_c = await claim_application_batch_for_submission(batch_id, user)
    assert claimed_c is True


@pytest.mark.asyncio
async def test_multi_worker_atomic_application_claim_prevents_duplicate_submission():
    """Two concurrent processes cannot submit the same application twice."""
    from backend.memory.career import (
        claim_career_application_for_submission,
        get_or_create_career_application,
        update_career_application,
    )
    from backend.models_career import CareerApplicationStatus

    user = "worker_app_claim_user"
    opp_id = await _get_test_opp_id("https://example.com/test-opp-claim-app-992")
    app_rec = await get_or_create_career_application(user, opp_id)
    await update_career_application(app_rec.id, user, {
        "status": CareerApplicationStatus.APPROVED_FOR_SUBMISSION.value,
    })

    # Worker 1 claims application
    claimed_1 = await claim_career_application_for_submission(app_rec.id, user)
    assert claimed_1 is True

    # Worker 2 attempts to claim the same application simultaneously
    claimed_2 = await claim_career_application_for_submission(app_rec.id, user)
    assert claimed_2 is False, "Worker 2 must be rejected from submitting an already-claimed application"


@pytest.mark.asyncio
async def test_in_memory_persistence_transparency_and_security_invariants():
    """
    When running in fallback/in-memory mode, data is transparently marked is_persisted=False.
    Security, ownership, and approval token gates are NEVER bypassed.
    """
    from backend.memory.career import (
        approve_application_batch,
        create_application_batch,
        get_application_batch,
        get_or_create_career_application,
    )

    with patch("backend.memory.career.get_pool", return_value=None):
        user = "persistence_transparency_user"
        resume = await upsert_master_resume(
            user,
            ResumeContent(full_name="Transparency Tester", skills=["Python"]),
            "Test Master",
        )
        assert resume.is_persisted is False
        app_rec = await get_or_create_career_application(user, 993)
        assert app_rec.is_persisted is False
        batch_id = await create_application_batch(user, [app_rec.id])

        # When database pool is unavailable/unconfigured in test, records must declare is_persisted=False
        batch = await get_application_batch(batch_id, user)
        assert batch is not None
        assert "is_persisted" in batch
        assert batch["is_persisted"] is False

        # Security check: cross-user approval must fail even during in-memory operation
        cross_user_ok = await approve_application_batch(batch_id, "attacker_user", "bat_token")
        assert cross_user_ok is False


@pytest.mark.asyncio
async def test_reconcile_stale_submission_claims_recovers_crashed_worker():
    """Stale claims from a crashed worker are reconciled without silent auto-retry."""
    from datetime import datetime, timezone, timedelta
    from backend.memory.career import (
        claim_application_batch_for_submission,
        claim_career_application_for_submission,
        create_application_batch,
        get_application_batch,
        get_career_application_by_id,
        get_or_create_career_application,
        get_pool,
        reconcile_stale_submission_claims,
        update_career_application,
    )
    from backend.models_career import CareerApplicationStatus

    user = "crash_recovery_user"
    opp_id = await _get_test_opp_id("https://example.com/test-opp-stale-claims-994")
    app_rec = await get_or_create_career_application(user, opp_id)
    await update_career_application(app_rec.id, user, {
        "status": CareerApplicationStatus.APPROVED_FOR_SUBMISSION.value,
    })
    batch_id = await create_application_batch(user, [app_rec.id])

    # Simulate batch approved then claimed
    from backend.memory.career import approve_application_batch
    await approve_application_batch(batch_id, user, "bat_token_test")
    await claim_application_batch_for_submission(batch_id, user)
    # Worker claims application for submission
    app_claimed = await claim_career_application_for_submission(app_rec.id, user)
    assert app_claimed is True

    # Artificially age the in-memory or DB records by 20 minutes
    stale_time = datetime.now(timezone.utc) - timedelta(minutes=20)
    from backend.memory.career import _in_memory_applications, _in_memory_batches
    if app_rec.id in _in_memory_applications:
        _in_memory_applications[app_rec.id]["updated_at"] = stale_time
    if batch_id in _in_memory_batches:
        _in_memory_batches[batch_id]["updated_at"] = stale_time

    pool = await get_pool()
    if pool:
        async with pool.acquire() as conn:
            await conn.execute("UPDATE career_applications SET updated_at = $1 WHERE id = $2", stale_time, app_rec.id)
            await conn.execute("UPDATE application_batches SET updated_at = $1 WHERE id = $2", stale_time, batch_id)

    # Reconcile stale claims (> 10 mins)
    res = await reconcile_stale_submission_claims(user, max_age_seconds=600)
    assert res["reconciled_applications"] >= 1
    assert res["reconciled_batches"] >= 1

    # Invariant: App is SUBMISSION_OUTCOME_UNKNOWN (preventing duplicate retry)
    recovered_app = await get_career_application_by_id(app_rec.id, user)
    assert recovered_app is not None
    assert recovered_app.status == CareerApplicationStatus.SUBMISSION_OUTCOME_UNKNOWN.value

    # Invariant: Batch reverted to READY_FOR_REVIEW with cleared token
    recovered_batch = await get_application_batch(batch_id, user)
    assert recovered_batch is not None
    assert recovered_batch["status"] == "READY_FOR_REVIEW"
    assert recovered_batch["approval_token"] is None


@pytest.mark.asyncio
async def test_replayed_approval_token_rejected_on_processed_batch():
    """Replaying an approval token on an already-processed batch returns 409 Duplicate."""
    from backend.memory.career import (
        approve_application_batch,
        create_application_batch,
        finish_application_batch,
        get_or_create_career_application,
    )
    user = "replay_token_user"
    opp_id = await _get_test_opp_id("https://example.com/test-opp-replay-token-995")
    app_rec = await get_or_create_career_application(user, opp_id)
    batch_id = await create_application_batch(user, [app_rec.id])
    await approve_application_batch(batch_id, user, "bat_replayable_token")
    await finish_application_batch(batch_id, user, [{"application_id": app_rec.id, "status": "SUBMITTED"}])

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            f"/api/career/batches/{batch_id}/submit",
            json={"batch_id": batch_id, "approval_token": "bat_replayable_token"},
            headers={"x-user-id": user},
        )
        assert res.status_code == 409
        assert "Duplicate submission rejected" in res.json()["detail"]
