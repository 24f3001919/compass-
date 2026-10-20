"""
Trace breakdown of 'What is RISC?' to isolate every millisecond:
1. Pool resolution
2. Database pre-fetch (history, prior, tasks, facts, parked)
3. Prompt assembly
4. Nebius API call initiation
5. Nebius TTFT (upstream model inference queue & TTFT)
6. Stream reading
"""

import asyncio
import json
import sys
import time
sys.path.insert(0, ".")
from backend.config import get_settings
from backend.memory.db import get_pool
from backend.models import StreamChatRequest
from backend.services.chat_stream import message_needs_tools
import openai

async def trace_direct():
    settings = get_settings()
    pool = await get_pool()
    message = "What is RISC?"

    print("\n--- DETAILED BACKEND TRACE: 'What is RISC?' ---")
    t0 = time.perf_counter()

    # Step 1: Pre-fetch checks
    t_start_db = time.perf_counter()
    async def _load_history():
        return []
    async def _load_prior():
        return None
    async def _load_tasks():
        async with pool.acquire() as conn:
            return await conn.fetch("SELECT title, domain, due_date, status, priority FROM tasks WHERE status != 'completed' ORDER BY due_date ASC NULLS LAST LIMIT 8")
    async def _load_facts():
        from backend.memory.profile import get_profile_facts
        async with pool.acquire() as conn:
            return await get_profile_facts(conn, user_id="default_user")
    async def _load_parked():
        from backend.memory.parked import list_parked_thoughts
        async with pool.acquire() as conn:
            rows = await list_parked_thoughts(conn, user_id="default_user", status="parked", limit=5)
            return [r["text"] for r in rows if r.get("text")]

    gather_res = await asyncio.gather(_load_history(), _load_prior(), _load_tasks(), _load_facts(), _load_parked(), return_exceptions=True)
    t_end_db = time.perf_counter()
    db_ms = (t_end_db - t_start_db) * 1000
    print(f"1. Database Parallel Pre-fetch: {db_ms:.2f} ms")

    # Step 2: System prompt construction
    t_start_prompt = time.perf_counter()
    from backend.persona import build_persona_system_prompt
    sys_prompt = build_persona_system_prompt(
        profile_facts=gather_res[3] if isinstance(gather_res[3], dict) else {},
        extra_context="Today's date is 2026-10-20.",
        tone=None,
        parked_thoughts=gather_res[4] if isinstance(gather_res[4], list) else [],
    )
    t_end_prompt = time.perf_counter()
    prompt_ms = (t_end_prompt - t_start_prompt) * 1000
    print(f"2. System Prompt Build: {prompt_ms:.2f} ms (Prompt len={len(sys_prompt)} chars)")

    # Step 3: Upstream Client Init & Call
    t_start_call = time.perf_counter()
    client = openai.AsyncOpenAI(
        api_key=settings.NEBIUS_API_KEY,
        base_url=settings.NEBIUS_BASE_URL,
        timeout=30.0,
    )
    req_messages = [{"role": "system", "content": sys_prompt}, {"role": "user", "content": message}]

    # Connect to Nebius
    stream = await client.chat.completions.create(
        model=settings.ROUTER_MODEL,
        messages=req_messages,
        temperature=0.7,
        max_tokens=600,
        stream=True,
    )
    t_conn_call = time.perf_counter()
    conn_ms = (t_conn_call - t_start_call) * 1000
    print(f"3. Upstream HTTP Handshake & Request Dispatch: {conn_ms:.2f} ms")

    # Step 4: Upstream Time to First Token (TTFT)
    t_first_chunk = None
    chunks_count = 0
    tokens = []
    async for chunk in stream:
        if t_first_chunk is None:
            t_first_chunk = time.perf_counter()
            upstream_ttft = (t_first_chunk - t_conn_call) * 1000
            print(f"4. Upstream Remote Model Inference TTFT: {upstream_ttft:.2f} ms")
        choices = chunk.choices or []
        if choices and choices[0].delta and choices[0].delta.content:
            tokens.append(choices[0].delta.content)
            chunks_count += 1

    t_end_stream = time.perf_counter()
    stream_duration = ((t_end_stream - t_first_chunk) * 1000) if t_first_chunk else 0
    total_ms = (t_end_stream - t0) * 1000
    print(f"5. Upstream Token Generation Duration: {stream_duration:.2f} ms ({chunks_count} chunks, {len(''.join(tokens).split())} words)")
    print(f"6. Total End-to-End Elapsed: {total_ms:.2f} ms")
    print(f"\nResponse preview: {''.join(tokens)[:100]}...\n")


async def main():
    print("\n>>> PASS 1 (Cold Start DB & Connection) <<<")
    await trace_direct()
    print("\n>>> PASS 2 (Warm Connection & Cached Pool) <<<")
    await trace_direct()


if __name__ == "__main__":
    asyncio.run(main())
