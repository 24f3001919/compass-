import asyncio
from collections import defaultdict
from backend.memory.db import get_pool

LEGACY_TITLES = [
    '36-hour Hackathon Sprint: Final Demo Build',
    'CS 61C Lab 4: RISC-V Pipeline Synthesis',
    'Record 3-minute Devpost demo video',
    'Nebius Buildathon Phase 2 Submission',
    'Deploy Compass backend to Nebius Serverless Endpoints',
    'CS 61C Midterm Review: Cache Hierarchies & Virtual Memory',
    'Embeddings truncation and Matryoshka dimension verification',
]

async def check():
    pool = await get_pool()
    if not pool:
        print('DB pool unavailable')
        return
    async with pool.acquire() as conn:
        rows = await conn.fetch('''
            SELECT id, user_id, domain, title, due_date, status, priority, notes, trusted_event_url, created_at
            FROM tasks
            WHERE title = ANY($1::text[])
            ORDER BY user_id, created_at DESC
        ''', LEGACY_TITLES)
        
        print(f"Total matching rows: {len(rows)}")
        by_user = defaultdict(list)
        for r in rows:
            by_user[r['user_id']].append(dict(r))
        
        print("\nSummary by user_id:")
        for uid, user_rows in by_user.items():
            has_marker = sum(1 for r in user_rows if r['trusted_event_url'])
            no_marker = len(user_rows) - has_marker
            print(f"  User: {uid} | Total: {len(user_rows)} (with fixture marker: {has_marker}, without marker: {no_marker})")

        print("\nDistinct legacy signatures (title, domain, priority, notes snippet):")
        distinct = await conn.fetch('''
            SELECT DISTINCT title, domain, priority, SUBSTRING(COALESCE(notes, '') FROM 1 FOR 60) as note_snip
            FROM tasks
            WHERE title = ANY($1::text[]) AND trusted_event_url IS NULL
            ORDER BY domain, title
        ''', LEGACY_TITLES)
        for d in distinct:
            print(f"  [{d['domain']}] '{d['title']}' ({d['priority']}): {d['note_snip']}")

if __name__ == '__main__':
    asyncio.run(check())
