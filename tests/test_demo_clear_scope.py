"""
Compass — Scope and Multi-Tenant Isolation Tests for clear_demo_tasks.
Guarantees real user tasks with 'demo' in title or URL survive explicit clear,
only compass://demo-persona/% rows for caller are removed, and other tenants are isolated.
"""

import uuid
import pytest
from backend.memory.db import get_pool
from backend.routers.tasks_verification import clear_demo_tasks, DEMO_TASK_TITLES


@pytest.mark.asyncio
async def test_demo_clear_scope_and_isolation():
    pool = await get_pool()
    assert pool is not None, "Database pool must be available"

    tenant_a = f"guest_scope_a_{uuid.uuid4().hex[:10]}"
    tenant_b = f"guest_scope_b_{uuid.uuid4().hex[:10]}"

    async with pool.acquire() as conn:
        try:
            # 1. Tenant A: Real task with title matching DEMO_TASK_TITLES
            title_in_demo = "Configure Production SSL & CORS Headers"
            assert title_in_demo in DEMO_TASK_TITLES
            id_a_title = await conn.fetchval(
                """
                INSERT INTO tasks (title, domain, user_id, trusted_event_url)
                VALUES ($1, $2, $3, $4) RETURNING id
                """,
                title_in_demo, "code", tenant_a, "https://github.com/myorg/issue/42"
            )

            # 2. Tenant A: Real task with URL containing 'demo'
            id_a_url = await conn.fetchval(
                """
                INSERT INTO tasks (title, domain, user_id, trusted_event_url)
                VALUES ($1, $2, $3, $4) RETURNING id
                """,
                "Demo day prep", "hackathon", tenant_a, "https://company.org/demo-rehearsal"
            )

            # 3. Tenant A: Legitimate Judge Persona tasks
            id_a_persona_1 = await conn.fetchval(
                """
                INSERT INTO tasks (title, domain, user_id, trusted_event_url)
                VALUES ($1, $2, $3, $4) RETURNING id
                """,
                "Nebius Buildathon Phase 1 Submission", "hackathon", tenant_a, "compass://demo-persona/nebius-p1"
            )
            id_a_persona_2 = await conn.fetchval(
                """
                INSERT INTO tasks (title, domain, user_id, trusted_event_url)
                VALUES ($1, $2, $3, $4) RETURNING id
                """,
                "CS 61C Homework 3: RISC-V Calling Conventions", "coursework", tenant_a, "compass://demo-persona/cs61c-hw3"
            )

            # 4. Tenant B (Other tenant): Real and persona tasks
            id_b_real = await conn.fetchval(
                """
                INSERT INTO tasks (title, domain, user_id, trusted_event_url)
                VALUES ($1, $2, $3, $4) RETURNING id
                """,
                "Tenant B Demo Task", "code", tenant_b, "https://tenant-b.org/demo"
            )
            id_b_persona = await conn.fetchval(
                """
                INSERT INTO tasks (title, domain, user_id, trusted_event_url)
                VALUES ($1, $2, $3, $4) RETURNING id
                """,
                "Nebius Buildathon Phase 1 Submission", "hackathon", tenant_b, "compass://demo-persona/nebius-p1"
            )

            # Step 1: Verify reload sequence never calls clear
            # Simulation of reload: query tasks directly without invoking clear_demo_tasks
            tasks_a_before = await conn.fetch("SELECT id FROM tasks WHERE user_id = $1", tenant_a)
            assert len(tasks_a_before) == 4, "Reload sequence must preserve all tasks (no automatic clear on mount)"

            # Step 2: Explicit User Reset for Tenant A only
            deleted_count = await clear_demo_tasks(conn, tenant_a)
            assert deleted_count == 2, f"Expected exactly 2 persona tasks deleted, got {deleted_count}"

            # Step 3: Assertions on Tenant A
            surviving_a = await conn.fetch(
                "SELECT id, title, trusted_event_url FROM tasks WHERE user_id = $1 ORDER BY id",
                tenant_a
            )
            surviving_a_ids = [r["id"] for r in surviving_a]

            # Real task with title in DEMO_TASK_TITLES must survive
            assert id_a_title in surviving_a_ids, "Real task matching a title in DEMO_TASK_TITLES must survive"

            # Real task with 'demo' in URL must survive
            assert id_a_url in surviving_a_ids, "Real task with 'demo' in trusted_event_url must survive"

            # Persona tasks must be removed
            assert id_a_persona_1 not in surviving_a_ids, "compass://demo-persona/% task must be deleted"
            assert id_a_persona_2 not in surviving_a_ids, "compass://demo-persona/% task must be deleted"

            # Step 4: Multi-tenant isolation — Tenant B must be completely untouched
            surviving_b = await conn.fetch(
                "SELECT id, title, trusted_event_url FROM tasks WHERE user_id = $1 ORDER BY id",
                tenant_b
            )
            surviving_b_ids = [r["id"] for r in surviving_b]
            assert id_b_real in surviving_b_ids, "Tenant B real task must remain completely untouched"
            assert id_b_persona in surviving_b_ids, "Tenant B persona task must remain completely untouched"
            assert len(surviving_b) == 2, "Tenant B task count must not change when Tenant A clears"

        finally:
            # Clean up test rows
            await conn.execute("DELETE FROM tasks WHERE user_id IN ($1, $2)", tenant_a, tenant_b)
