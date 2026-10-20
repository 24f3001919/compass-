"""
Targeted cleanup of accidental test task 1028.
Verifies record identity unambiguously before deleting.
Preserves audit logs and marks revert status.
"""

import sys
sys.path.insert(0, ".")
import asyncio
from backend.memory.db import get_pool

async def cleanup():
    pool = await get_pool()
    async with pool.acquire() as conn:
        print("=== STEP 1: VERIFY TARGET RECORD UNAMBIGUOUSLY ===")
        row = await conn.fetchrow("SELECT id, title, user_id, status, domain, created_at FROM tasks WHERE id = 1028")
        if not row:
            print("ERROR: Task 1028 not found in database. Aborting without action.")
            return

        print(f"Found record: ID={row['id']}, Title='{row['title']}', User='{row['user_id']}', Status='{row['status']}', Created='{row['created_at']}'")

        if row['id'] != 1028 or "RISC presentation" not in row['title']:
            print("ERROR: Record does not match expected disposable test task. Aborting!")
            return

        print("\n=== STEP 2: CHECK AUDIT LOG PRESERVATION ===")
        audit_rows = await conn.fetch("SELECT id, tool, affected_id, is_reverted, created_at FROM agent_audit_log WHERE affected_id = '1028' OR tool = 'add_task' ORDER BY id DESC LIMIT 5")
        for a in audit_rows:
            print(f"  Audit entry: ID={a['id']}, Tool={a['tool']}, AffectedID={a['affected_id']}, Reverted={a['is_reverted']}")

        print("\n=== STEP 3: PERFORM TARGETED DELETION ===")
        deleted = await conn.execute(
            "DELETE FROM tasks WHERE id = $1 AND title = $2 AND user_id = $3",
            1028,
            row['title'],
            row['user_id'],
        )
        print(f"Deletion result: {deleted}")

        # Mark corresponding audit log entry as reverted if present
        reverted_count = await conn.execute("UPDATE agent_audit_log SET is_reverted = TRUE WHERE affected_id = '1028'")
        print(f"Audit log status updated: {reverted_count}")

        print("\n=== STEP 4: VERIFY CLEANUP & INTEGRITY OF OTHER TASKS ===")
        check_row = await conn.fetchrow("SELECT id, title FROM tasks WHERE id = 1028")
        if check_row is None:
            print("CONFIRMED: Task 1028 no longer exists in tasks table.")
        else:
            print("WARNING: Task 1028 still found!")

        remaining_count = await conn.fetchval("SELECT count(*) FROM tasks")
        print(f"Total remaining tasks count in database: {remaining_count}")

if __name__ == "__main__":
    asyncio.run(cleanup())
