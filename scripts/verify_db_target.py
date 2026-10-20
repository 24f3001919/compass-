import sys
sys.path.insert(0, '.')
import asyncio
from backend.memory.db import get_pool

from backend.config import get_settings

async def check():
    settings = get_settings()
    pool = await get_pool()
    async with pool.acquire() as conn:
        db_name = await conn.fetchval('SELECT current_database()')
        current_user = await conn.fetchval('SELECT current_user')
        server_addr = await conn.fetchval('SELECT inet_server_addr()')
        env_mode = settings.ENVIRONMENT
        print(f"Environment Mode: {env_mode}")
        print(f"Database Name: {db_name}")
        print(f"Current DB User: {current_user}")
        print(f"Server Addr: {server_addr}")
        
        # Check tasks created today
        today_tasks = await conn.fetch("SELECT id, title, user_id, created_at FROM tasks WHERE created_at >= CURRENT_DATE ORDER BY id DESC")
        print(f"\nTasks created today (count={len(today_tasks)}):")
        for r in today_tasks:
            print(f"  [{r['id']}] '{r['title']}' (user: {r['user_id']}, created: {r['created_at']})")


if __name__ == '__main__':
    asyncio.run(check())
