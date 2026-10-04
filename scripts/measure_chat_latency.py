import asyncio
import json
import statistics
import time
from typing import Any, Dict, List

import httpx

BASE_URL = "http://localhost:8000"
AUTH_HEADER = {"Authorization": "Bearer dev-token", "Content-Type": "application/json"}
RUNS = 5


async def single_stream_run(prompt: str) -> Dict[str, Any]:
    t0 = time.perf_counter()
    first_byte_time = None
    first_token_time = None
    tokens_received = []
    done_time = None
    skill_used = None

    async with httpx.AsyncClient(timeout=45.0) as client:
        async with client.stream(
            "POST",
            f"{BASE_URL}/api/chat/stream",
            headers=AUTH_HEADER,
            json={"message": prompt},
        ) as response:
            t_connect = time.perf_counter() - t0
            first_byte_time = t_connect

            async for chunk in response.aiter_lines():
                t_now = time.perf_counter() - t0
                if not chunk or not chunk.startswith("data:"):
                    continue
                raw_json = chunk[5:].strip()
                try:
                    data = json.loads(raw_json)
                    if data.get("type") == "token":
                        if first_token_time is None:
                            first_token_time = t_now
                        tokens_received.append(data.get("value", ""))
                    elif data.get("type") == "done":
                        done_time = t_now
                        skill_used = data.get("skill_used")
                except Exception:
                    pass

    full_text = "".join(tokens_received)
    total_time = done_time or (time.perf_counter() - t0)
    return {
        "connect_ms": (first_byte_time or 0) * 1000,
        "ttft_ms": (first_token_time or 0) * 1000,
        "total_ms": total_time * 1000,
        "tokens": len(tokens_received),
        "words": len(full_text.split()),
        "skill": skill_used,
        "text": full_text[:80],
    }


async def single_sync_run(prompt: str) -> Dict[str, Any]:
    t0 = time.perf_counter()
    async with httpx.AsyncClient(timeout=45.0) as client:
        res = await client.post(
            f"{BASE_URL}/api/chat",
            headers=AUTH_HEADER,
            json={"message": prompt},
        )
        total_time = time.perf_counter() - t0
        data = res.json()
        return {
            "total_ms": total_time * 1000,
            "skill": data.get("skill_used"),
            "text": str(data.get("response", ""))[:80],
        }


def compute_stats(vals: List[float]) -> Dict[str, float]:
    if not vals:
        return {"mean": 0.0, "var": 0.0, "stddev": 0.0, "min": 0.0, "max": 0.0}
    mean = statistics.mean(vals)
    var = statistics.variance(vals) if len(vals) > 1 else 0.0
    stddev = statistics.stdev(vals) if len(vals) > 1 else 0.0
    return {
        "mean": round(mean, 1),
        "var": round(var, 1),
        "stddev": round(stddev, 1),
        "min": round(min(vals), 1),
        "max": round(max(vals), 1),
    }


async def benchmark_scenario(name: str, prompt: str, is_stream: bool) -> Dict[str, Any]:
    print("\n=======================================================")
    print(f"BENCHMARK: {name} (N={RUNS} iterations)")
    print(f"Prompt: \"{prompt}\"")
    print("=======================================================")

    results = []
    for i in range(1, RUNS + 1):
        if is_stream:
            res = await single_stream_run(prompt)
            print(
                f"  Run {i}/{RUNS}: TTFT={res['ttft_ms']:.1f}ms, Total={res['total_ms']:.1f}ms, "
                f"Connect={res['connect_ms']:.1f}ms, Skill={res['skill']}, Chunks={res['tokens']}"
            )
        else:
            res = await single_sync_run(prompt)
            print(f"  Run {i}/{RUNS}: Total={res['total_ms']:.1f}ms, Skill={res['skill']}")
        results.append(res)
        await asyncio.sleep(0.5)

    total_stats = compute_stats([r["total_ms"] for r in results])
    ttft_stats = compute_stats([r["ttft_ms"] for r in results]) if is_stream else None
    connect_stats = compute_stats([r["connect_ms"] for r in results]) if is_stream else None

    print(f"-> Summary for {name}:")
    if ttft_stats:
        print(f"   TTFT:  mean={ttft_stats['mean']}ms, stddev=±{ttft_stats['stddev']}ms, var={ttft_stats['var']}")
    print(f"   Total: mean={total_stats['mean']}ms, stddev=±{total_stats['stddev']}ms, var={total_stats['var']}")

    return {
        "name": name,
        "is_stream": is_stream,
        "ttft": ttft_stats,
        "connect": connect_stats,
        "total": total_stats,
        "sample": results[0],
    }


async def main():
    benchmarks = [
        ("Conversational — Stream", "hey, what can you help with", True),
        ("Conversational — Sync", "hey, what can you help with", False),
        ("Skill/Tool — Stream", "show my coursework tasks", True),
        ("Skill/Tool — Sync", "show my coursework tasks", False),
    ]

    all_data = []
    for name, prompt, is_stream in benchmarks:
        data = await benchmark_scenario(name, prompt, is_stream)
        all_data.append(data)

    print("\n\n" + "=" * 70)
    print("FINAL CONSOLIDATED MULTI-RUN BENCHMARK REPORT (N=5)")
    print("=" * 70)
    print("| Scenario | Mode | TTFT Mean (±StdDev) [Var] | Total Time Mean (±StdDev) [Var] | Connect Mean |")
    print("| :--- | :--- | :--- | :--- | :--- |")
    for d in all_data:
        mode = "Stream" if d["is_stream"] else "Sync"
        if d["is_stream"]:
            ttft_str = f"**{d['ttft']['mean']} ms** (±{d['ttft']['stddev']} ms) [{d['ttft']['var']}]"
            connect_str = f"{d['connect']['mean']} ms"
        else:
            ttft_str = "N/A (Sync buffer)"
            connect_str = "N/A"
        tot_str = f"**{d['total']['mean']} ms** (±{d['total']['stddev']} ms) [{d['total']['var']}]"
        print(f"| {d['name']} | {mode} | {ttft_str} | {tot_str} | {connect_str} |")


if __name__ == "__main__":
    asyncio.run(main())
