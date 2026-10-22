"""
Compass — Reconciled Monotonic Multi-Stage Latency Benchmarking Harness.

Uses correlation IDs and high-resolution monotonic timestamps (time.perf_counter())
to capture the exact lifecycle stages:
1. Request initiation / submit
2. Client HTTP connection start
3. Headers & First SSE event received
4. Provider dispatch & TTFT
5. First meaningful token arrival
6. Stream completion

Runs 5 warm repetitions on 'What is RISC?' with detailed stage breakdowns.
"""

import asyncio
import json
import statistics
import time
import uuid
from typing import Any, Dict, List
import httpx

BASE_URL = "http://localhost:8000"
AUTH_HEADER = {"Authorization": "Bearer dev-token", "Content-Type": "application/json"}
PROMPT = "What is RISC?"
REPS = 5

async def benchmark_reconciled_run(run_idx: int) -> Dict[str, Any]:
    cid = f"reconcile-{uuid.uuid4().hex[:8]}"
    t_submit = time.perf_counter()
    
    # Stage tracking
    t_conn_start = t_submit
    t_headers = None
    t_first_event = None
    t_first_token = None
    t_done = None
    
    events_log = []
    tokens = []
    skill = None

    async with httpx.AsyncClient(timeout=30.0) as client:
        t_req_start = time.perf_counter()
        async with client.stream(
            "POST",
            f"{BASE_URL}/api/chat/stream",
            headers={**AUTH_HEADER, "X-Correlation-ID": cid},
            json={"message": PROMPT},
        ) as response:
            t_headers = time.perf_counter()
            
            async for line in response.aiter_lines():
                t_now = time.perf_counter()
                if not line:
                    continue
                if line.startswith(":"):
                    if t_first_event is None:
                        t_first_event = t_now
                    events_log.append((round((t_now - t_submit)*1000, 2), "comment", line))
                    continue
                
                if line.startswith("data:"):
                    if t_first_event is None:
                        t_first_event = t_now
                    raw = line[5:].strip()
                    try:
                        data = json.loads(raw)
                        evt_type = data.get("type")
                        events_log.append((round((t_now - t_submit)*1000, 2), evt_type, data))
                        
                        if evt_type == "token":
                            val = data.get("value", "")
                            tokens.append(val)
                            if t_first_token is None and val.strip():
                                t_first_token = t_now
                        elif evt_type == "done":
                            t_done = t_now
                            skill = data.get("skill_used")
                    except Exception:
                        pass

    t_end = t_done or time.perf_counter()

    durations = {
        "run_idx": run_idx,
        "correlation_id": cid,
        "client_connect_ms": (t_headers - t_submit) * 1000 if t_headers else 0,
        "first_event_ms": (t_first_event - t_submit) * 1000 if t_first_event else 0,
        "first_meaningful_token_ms": (t_first_token - t_submit) * 1000 if t_first_token else 0,
        "total_completion_ms": (t_end - t_submit) * 1000,
        "token_stream_duration_ms": (t_end - t_first_token) * 1000 if t_first_token else 0,
        "tokens_count": len(tokens),
        "skill": skill,
        "events_count": len(events_log),
    }
    return durations

async def main():
    print("=" * 70)
    print("PHASE 1: RECONCILED LATENCY BENCHMARK (5 WARM RUNS)")
    print(f"Prompt: '{PROMPT}'")
    print("=" * 70)

    # Warmup
    print("Executing 1 warmup run...")
    await benchmark_reconciled_run(0)
    await asyncio.sleep(0.5)

    results = []
    for i in range(1, REPS + 1):
        res = await benchmark_reconciled_run(i)
        print(f"  Run #{i}: Total={res['total_completion_ms']:.1f}ms | FirstEvent={res['first_event_ms']:.1f}ms | FirstToken={res['first_meaningful_token_ms']:.1f}ms | Tokens={res['tokens_count']}")
        results.append(res)
        await asyncio.sleep(0.3)

    totals = [r["total_completion_ms"] for r in results]
    first_events = [r["first_event_ms"] for r in results]
    first_tokens = [r["first_meaningful_token_ms"] for r in results]
    connects = [r["client_connect_ms"] for r in results]
    stream_durs = [r["token_stream_duration_ms"] for r in results]

    print("\n" + "=" * 70)
    print("RECONCILED STAGE TIMING SUMMARY")
    print("=" * 70)
    print("1. Client Connect / Headers Received:")
    print(f"   Median: {statistics.median(connects):.1f} ms (Range: {min(connects):.1f} - {max(connects):.1f} ms)")
    print("2. First SSE Event Received by Client:")
    print(f"   Median: {statistics.median(first_events):.1f} ms (Range: {min(first_events):.1f} - {max(first_events):.1f} ms)")
    print("3. First Meaningful Text Token Received:")
    print(f"   Median: {statistics.median(first_tokens):.1f} ms (Range: {min(first_tokens):.1f} - {max(first_tokens):.1f} ms)")
    print("4. Token Generation & Streaming Duration:")
    print(f"   Median: {statistics.median(stream_durs):.1f} ms (Range: {min(stream_durs):.1f} - {max(stream_durs):.1f} ms)")
    print("5. Total Response Completion Time:")
    print(f"   Median: {statistics.median(totals):.1f} ms (Range: {min(totals):.1f} - {max(totals):.1f} ms)")

if __name__ == "__main__":
    asyncio.run(main())
