#!/usr/bin/env python3
"""
Compass — Scoped Legacy Demo Task Cleanup Script.

Safely targets only rows in isolated development/test databases that match:
1. Exact titles of the 7 legacy demo seed items (from commit c34cf7b).
2. Missing fixture marker (trusted_event_url IS NULL).
3. Exact creating-code signatures (domain, priority, notes prefix).

DEFAULTS TO --dry-run. NEVER RUNS ON PRODUCTION.
"""

import argparse
import asyncio
import logging
import sys
from typing import List, Tuple

from backend.config import get_settings
from backend.memory.db import get_pool

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("cleanup_legacy_demo")

# Exact 7 legacy titles and creating-code signatures from commit c34cf7b
LEGACY_SIGNATURES: List[Tuple[str, str, str, str]] = [
    # (title, domain, priority, notes_prefix)
    (
        "36-hour Hackathon Sprint: Final Demo Build",
        "hackathon",
        "urgent",
        "Full weekend sprint to finalize 3-minute video demo",
    ),
    (
        "CS 61C Lab 4: RISC-V Pipeline Synthesis",
        "coursework",
        "urgent",
        "Two-stage pipelined CPU in Logisim with forwarding and hazard resolution",
    ),
    (
        "Record 3-minute Devpost demo video",
        "hackathon",
        "urgent",
        "Record, edit, and upload demo video to YouTube",
    ),
    (
        "Nebius Buildathon Phase 2 Submission",
        "hackathon",
        "high",
        "Original hackathon milestone to demonstrate live Tavily schedule drift detection",
    ),
    (
        "Deploy Compass backend to Nebius Serverless Endpoints",
        "code",
        "high",
        "Activate deploy/serverless_endpoint.yaml manifest on Nebius AI Cloud",
    ),
    (
        "CS 61C Midterm Review: Cache Hierarchies & Virtual Memory",
        "coursework",
        "high",
        "Review L1/L2 cache design, TLB mechanics, page table walks",
    ),
    (
        "Embeddings truncation and Matryoshka dimension verification",
        "code",
        "medium",
        "Qwen3-Embedding-8B",
    ),
]


CLEANUP_SQL = """
DELETE FROM tasks
WHERE trusted_event_url IS NULL
  AND (
    (title = '36-hour Hackathon Sprint: Final Demo Build' AND domain = 'hackathon' AND priority = 'urgent' AND notes LIKE 'Full weekend sprint to finalize 3-minute video demo%')
    OR (title = 'CS 61C Lab 4: RISC-V Pipeline Synthesis' AND domain = 'coursework' AND priority = 'urgent' AND notes LIKE 'Two-stage pipelined CPU in Logisim%')
    OR (title = 'Record 3-minute Devpost demo video' AND domain = 'hackathon' AND priority = 'urgent' AND notes LIKE 'Record, edit, and upload demo video%')
    OR (title = 'Nebius Buildathon Phase 2 Submission' AND domain = 'hackathon' AND priority = 'high' AND notes LIKE 'Original hackathon milestone%')
    OR (title = 'Deploy Compass backend to Nebius Serverless Endpoints' AND domain = 'code' AND priority = 'high' AND notes LIKE 'Activate deploy/serverless_endpoint.yaml manifest%')
    OR (title = 'CS 61C Midterm Review: Cache Hierarchies & Virtual Memory' AND domain = 'coursework' AND priority = 'high' AND notes LIKE 'Review L1/L2 cache design%')
    OR (title = 'Embeddings truncation and Matryoshka dimension verification' AND domain = 'code' AND priority = 'medium' AND notes LIKE '%Qwen3-Embedding-8B%')
  );
"""


SELECT_DRY_RUN_SQL = """
SELECT id, user_id, domain, title, due_date, status, priority, created_at, SUBSTRING(COALESCE(notes, '') FROM 1 FOR 50) as note_snip
FROM tasks
WHERE trusted_event_url IS NULL
  AND (
    (title = '36-hour Hackathon Sprint: Final Demo Build' AND domain = 'hackathon' AND priority = 'urgent' AND notes LIKE 'Full weekend sprint to finalize 3-minute video demo%')
    OR (title = 'CS 61C Lab 4: RISC-V Pipeline Synthesis' AND domain = 'coursework' AND priority = 'urgent' AND notes LIKE 'Two-stage pipelined CPU in Logisim%')
    OR (title = 'Record 3-minute Devpost demo video' AND domain = 'hackathon' AND priority = 'urgent' AND notes LIKE 'Record, edit, and upload demo video%')
    OR (title = 'Nebius Buildathon Phase 2 Submission' AND domain = 'hackathon' AND priority = 'high' AND notes LIKE 'Original hackathon milestone%')
    OR (title = 'Deploy Compass backend to Nebius Serverless Endpoints' AND domain = 'code' AND priority = 'high' AND notes LIKE 'Activate deploy/serverless_endpoint.yaml manifest%')
    OR (title = 'CS 61C Midterm Review: Cache Hierarchies & Virtual Memory' AND domain = 'coursework' AND priority = 'high' AND notes LIKE 'Review L1/L2 cache design%')
    OR (title = 'Embeddings truncation and Matryoshka dimension verification' AND domain = 'code' AND priority = 'medium' AND notes LIKE '%Qwen3-Embedding-8B%')
  )
ORDER BY user_id, id ASC;
"""


async def run_cleanup(execute: bool = False):
    settings = get_settings()
    env = getattr(settings, "ENVIRONMENT", "").lower()
    if execute and env == "production":
        logger.error("Refusing to run legacy cleanup execution in PRODUCTION environment.")
        sys.exit(1)

    pool = await get_pool()
    if not pool:
        logger.error("Database connection unavailable.")
        sys.exit(1)

    async with pool.acquire() as conn:
        matching_rows = await conn.fetch(SELECT_DRY_RUN_SQL)
        logger.info("Found %d legacy demo rows matching strict signature.", len(matching_rows))

        if not execute:
            logger.info("=== DRY-RUN MODE (No changes executed) ===")
            logger.info("Dry-Run SQL to be executed on target DB:")
            print("\n--- BEGIN DRY-RUN SQL ---")
            print(CLEANUP_SQL.strip())
            print("--- END DRY-RUN SQL ---\n")
            print(f"Total matching legacy rows identified: {len(matching_rows)}")
            for r in matching_rows[:15]:
                print(f"  [id={r['id']}] user={r['user_id']} | {r['domain']} | {r['title']} | notes='{r['note_snip']}...'")
            if len(matching_rows) > 15:
                print(f"  ... and {len(matching_rows) - 15} more rows.")
            logger.info("To apply changes, pass --execute (isolated dev/test only).")
            return

        logger.warning("EXECUTE FLAG DETECTED. Proceeding with scoped deletion on isolated DB...")
        deleted_count_res = await conn.execute(CLEANUP_SQL)
        logger.info("Deletion completed: %s", deleted_count_res)


def main():
    parser = argparse.ArgumentParser(description="Scoped cleanup of legacy demo tasks from commit c34cf7b.")
    parser.add_argument("--execute", action="store_true", help="Execute deletion (isolated dev/test only). Defaults to dry-run.")
    args = parser.parse_args()

    asyncio.run(run_cleanup(execute=args.execute))


if __name__ == "__main__":
    main()
