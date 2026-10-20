"""
Compass — Real PostgreSQL Persistence, Process-Level Concurrency & Recovery Verification.

Executes genuinely against TEST_DATABASE_URL (isolated test database).
Guarded by validate_test_db_guard in tests/conftest.py.
"""
from __future__ import annotations

import asyncio
import multiprocessing
import os
import time
from datetime import datetime, timezone, timedelta
import pytest

from backend.config import get_settings
from backend.memory.career import (
    approve_application_batch,
    claim_application_batch_for_submission,
    claim_career_application_for_submission,
    create_application_batch,
    create_tailored_resume,
    get_application_batch,
    get_career_application_by_id,
    get_master_resume,
    get_or_create_career_application,
    get_pool,
    reconcile_stale_submission_claims,
    release_application_batch_claim,
    update_career_application,
    upsert_master_resume,
)
from backend.memory.db import close_pool, init_pool
from backend.memory.radar import upsert_opportunity
from backend.models_career import (
    CareerApplicationStatus,
    ResumeContent,
    ResumeValidationReport,
    ResumeValidationStatus,
)


@pytest.fixture(autouse=True)
def ensure_real_postgres():
    """Ensure tests in this module run against real PostgreSQL."""
    test_db = os.environ.get("TEST_DATABASE_URL", "").strip()
    if not test_db:
        pytest.skip("TEST_DATABASE_URL not set; skipping real PostgreSQL persistence suite.")


@pytest.mark.asyncio
async def test_schema_and_migration_consistency():
    """Verify that all Career Copilot tables and foreign keys exist in real PostgreSQL."""
    pool = await get_pool()
    assert pool is not None, "Real PostgreSQL pool must be active"

    async with pool.acquire() as conn:
        tables = await conn.fetch(
            """
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name IN ('resumes', 'career_applications', 'application_batches', 'application_events', 'opportunities', 'original_resume_documents')
            """
        )
        found_tables = {r["table_name"] for r in tables}
        expected = {'resumes', 'career_applications', 'application_batches', 'application_events', 'opportunities', 'original_resume_documents'}
        assert expected.issubset(found_tables), f"Missing tables: {expected - found_tables}"


@pytest.mark.asyncio
async def test_persistence_across_backend_restart():
    """
    Verify application and resume state persistence across simulated backend restart.
    Records written in Session 1 must be durably present when reconnected in Session 2.
    """
    user_id = f"restart_test_user_{int(time.time())}"

    # 1. Session 1: Create master resume and opportunity
    opp_id = await upsert_opportunity(
        company_name="Durable Corp",
        role_title="Backend Engineer Intern",
        canonical_url=f"https://durable.corp/jobs/{user_id}",
    )
    master = await upsert_master_resume(
        user_id,
        ResumeContent(full_name="Durable Candidate", email=f"{user_id}@example.com", skills=["Python", "PostgreSQL"]),
        "Durable Master Resume",
    )
    assert master.is_persisted is True

    tailored = await create_tailored_resume(
        user_id=user_id,
        opportunity_id=opp_id,
        title="Durable Tailored Resume",
        content=ResumeContent(full_name="Durable Candidate", skills=["Python", "PostgreSQL"]),
        validation_report=ResumeValidationReport(is_valid=True, passed_checks=["Factual"]),
        validation_status=ResumeValidationStatus.APPROVED,
    )
    assert tailored.is_persisted is True

    app_rec = await get_or_create_career_application(user_id, opp_id)
    assert app_rec.is_persisted is True
    await update_career_application(app_rec.id, user_id, {
        "resume_id": tailored.id,
        "private_notes": "Important note to survive restart",
    })

    # 2. Simulate Backend Shutdown: terminate connection pool completely
    await close_pool()

    # 3. Simulate Backend Restart: initialize fresh connection pool
    fresh_pool = await init_pool()
    assert fresh_pool is not None

    # 4. Verify durable persistence across restart
    fetched_master = await get_master_resume(user_id)
    assert fetched_master is not None
    assert fetched_master.is_persisted is True
    assert fetched_master.content.full_name == "Durable Candidate"

    fetched_app = await get_career_application_by_id(app_rec.id, user_id)
    assert fetched_app is not None
    assert fetched_app.is_persisted is True
    assert fetched_app.private_notes == "Important note to survive restart"
    assert fetched_app.resume_id == tailored.id


@pytest.mark.asyncio
async def test_multi_tenant_isolation_in_database():
    """Verify tenant isolation at PostgreSQL level: User A cannot read or mutate User B's records."""
    user_a = f"alice_{int(time.time())}"
    user_b = f"bob_{int(time.time())}"

    opp_id = await upsert_opportunity(
        company_name="Iso Corp",
        role_title="Security Intern",
        canonical_url=f"https://iso.corp/jobs/{user_a}",
    )
    app_a = await get_or_create_career_application(user_a, opp_id)
    assert app_a.is_persisted is True

    # User B cannot access User A's application
    app_b_view = await get_career_application_by_id(app_a.id, user_b)
    assert app_b_view is None

    # User B cannot mutate User A's application
    mutated = await update_career_application(app_a.id, user_b, {"private_notes": "Hacked"})
    assert mutated is None

    # Verify User A's data was not touched
    app_a_check = await get_career_application_by_id(app_a.id, user_a)
    assert app_a_check.private_notes != "Hacked"


def _worker_claim_batch(batch_id: str, user_id: str, result_queue: multiprocessing.Queue):
    """Separate OS worker process entry point for testing batch claim concurrency."""
    from backend.memory.career import claim_application_batch_for_submission
    from backend.memory.db import init_pool, close_pool

    async def _run():
        await init_pool()
        res = await claim_application_batch_for_submission(batch_id, user_id)
        result_queue.put(res)
        await close_pool()

    asyncio.run(_run())


def _worker_claim_app(app_id: int, user_id: str, result_queue: multiprocessing.Queue):
    """Separate OS worker process entry point for testing individual app claim concurrency."""
    from backend.memory.career import claim_career_application_for_submission
    from backend.memory.db import init_pool, close_pool

    async def _run():
        await init_pool()
        res = await claim_career_application_for_submission(app_id, user_id)
        result_queue.put(res)
        await close_pool()

    asyncio.run(_run())


@pytest.mark.asyncio
async def test_multi_process_atomic_batch_claim_concurrency():
    """Verify atomic batch claims under multi-process concurrency (separate OS processes)."""
    user_id = f"proc_user_{int(time.time())}"
    opp_id = await upsert_opportunity(
        company_name="Concurrent Corp",
        role_title="Systems Intern",
        canonical_url=f"https://concurrent.corp/jobs/{user_id}",
    )
    app_rec = await get_or_create_career_application(user_id, opp_id)
    batch_id = await create_application_batch(user_id, [app_rec.id])
    await approve_application_batch(batch_id, user_id, "bat_token_proc_test")

    # Spawn 2 distinct OS processes trying to claim simultaneously
    q = multiprocessing.Queue()
    p1 = multiprocessing.Process(target=_worker_claim_batch, args=(batch_id, user_id, q))
    p2 = multiprocessing.Process(target=_worker_claim_batch, args=(batch_id, user_id, q))

    p1.start()
    p2.start()
    p1.join(timeout=15.0)
    p2.join(timeout=15.0)

    results = []
    while not q.empty():
        results.append(q.get_nowait())

    assert len(results) == 2
    # Exactly one process must succeed, and the other must fail
    assert results.count(True) == 1, f"Expected exactly 1 claim winner, got: {results}"
    assert results.count(False) == 1, f"Expected exactly 1 claim loser, got: {results}"


@pytest.mark.asyncio
async def test_multi_process_atomic_application_claim_concurrency():
    """Verify atomic application claims under multi-process concurrency (separate OS processes)."""
    user_id = f"proc_app_user_{int(time.time())}"
    opp_id = await upsert_opportunity(
        company_name="Concurrent Corp App",
        role_title="Systems Intern",
        canonical_url=f"https://concurrent-app.corp/jobs/{user_id}",
    )
    app_rec = await get_or_create_career_application(user_id, opp_id)
    await update_career_application(app_rec.id, user_id, {
        "status": CareerApplicationStatus.APPROVED_FOR_SUBMISSION.value,
    })

    # Spawn 2 distinct OS processes trying to claim simultaneously
    q = multiprocessing.Queue()
    p1 = multiprocessing.Process(target=_worker_claim_app, args=(app_rec.id, user_id, q))
    p2 = multiprocessing.Process(target=_worker_claim_app, args=(app_rec.id, user_id, q))

    p1.start()
    p2.start()
    p1.join(timeout=15.0)
    p2.join(timeout=15.0)

    results = []
    while not q.empty():
        results.append(q.get_nowait())

    assert len(results) == 2
    # Exactly one process must succeed, and the other must fail
    assert results.count(True) == 1, f"Expected exactly 1 app claim winner, got: {results}"
    assert results.count(False) == 1, f"Expected exactly 1 app claim loser, got: {results}"


@pytest.mark.asyncio
async def test_claim_release_behavior():
    """Verify that releasing a safe claim allows resetting to APPROVED and claiming again."""
    user_id = f"release_user_{int(time.time())}"
    opp_id = await upsert_opportunity(
        company_name="Release Corp",
        role_title="DevOps Intern",
        canonical_url=f"https://release.corp/jobs/{user_id}",
    )
    app_rec = await get_or_create_career_application(user_id, opp_id)
    batch_id = await create_application_batch(user_id, [app_rec.id])
    await approve_application_batch(batch_id, user_id, "bat_token_release")

    # Claim
    assert await claim_application_batch_for_submission(batch_id, user_id) is True
    # Second claim fails
    assert await claim_application_batch_for_submission(batch_id, user_id) is False

    # Safe release
    released = await release_application_batch_claim(batch_id, user_id, "APPROVED")
    assert released is True

    # Re-claimed successfully
    assert await claim_application_batch_for_submission(batch_id, user_id) is True


@pytest.mark.asyncio
async def test_crash_recovery_and_submission_outcome_unknown_persistence():
    """Verify stale claim reconciliation and durable persistence of SUBMISSION_OUTCOME_UNKNOWN."""
    user_id = f"crash_user_{int(time.time())}"
    opp_id = await upsert_opportunity(
        company_name="Crash Corp",
        role_title="Reliability Intern",
        canonical_url=f"https://crash.corp/jobs/{user_id}",
    )
    app_rec = await get_or_create_career_application(user_id, opp_id)
    await update_career_application(app_rec.id, user_id, {
        "status": CareerApplicationStatus.APPROVED_FOR_SUBMISSION.value,
    })
    batch_id = await create_application_batch(user_id, [app_rec.id])
    await approve_application_batch(batch_id, user_id, "bat_token_crash")
    await claim_application_batch_for_submission(batch_id, user_id)
    await claim_career_application_for_submission(app_rec.id, user_id)

    # Set timestamps to 20 minutes ago directly in PostgreSQL
    stale_time = datetime.now(timezone.utc) - timedelta(minutes=20)
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("UPDATE career_applications SET updated_at = $1 WHERE id = $2", stale_time, app_rec.id)
        await conn.execute("UPDATE application_batches SET updated_at = $1 WHERE id = $2", stale_time, batch_id)

    # Run reconciliation
    rec = await reconcile_stale_submission_claims(user_id, max_age_seconds=600)
    assert rec["reconciled_applications"] >= 1
    assert rec["reconciled_batches"] >= 1

    # Verify durable state in PostgreSQL
    recovered_app = await get_career_application_by_id(app_rec.id, user_id)
    assert recovered_app.status == CareerApplicationStatus.SUBMISSION_OUTCOME_UNKNOWN.value
    assert recovered_app.is_persisted is True

    recovered_batch = await get_application_batch(batch_id, user_id)
    assert recovered_batch["status"] == "READY_FOR_REVIEW"
    assert recovered_batch["approval_token"] is None
    assert recovered_batch["is_persisted"] is True
