"""
Compass — Phase 1 & Phase 2 Repeatable Performance Benchmark Harness.

Measures:
A. Simple question: "What is RISC?"
B. Web research: "Verify the Nebius hackathon deadline on Devpost."
C. Context-dependent question: "What deadlines or tasks do I have scheduled for Nebius or presentations?"
D. Long answer: "Compare RISC vs CISC across architecture philosophy, instruction format, pipelining, register counts, power efficiency, and modern hybrid processor implementations."

Measures per run:
- Request initiation time
- First visible feedback (ping / status event)
- First backend event
- First meaningful answer text (first 'token' event with non-empty content)
- Full completion time
- Token count and word count
- Detected stages / skills
"""

import asyncio
import json
import statistics
import time
from typing import Any, Dict, List
import httpx

BASE_URL = "http://localhost:8000"
AUTH_HEADER = {"Authorization": "Bearer dev-token", "Content-Type": "application/json"}
WARM_RUNS = 5


async def measure_stream_request(prompt: str, conv_id: str = None) -> Dict[str, Any]:
    t_start = time.perf_counter()
    first_event_t = None
    first_status_t = None
    first_meaningful_token_t = None
    status_events = []
    tokens = []
    done_t = None
    skill_used = None
    err = None

    payload = {"message": prompt}
    if conv_id:
        payload["conversation_id"] = conv_id

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                f"{BASE_URL}/api/chat/stream",
                headers=AUTH_HEADER,
                json=payload,
            ) as response:
                t_connect = time.perf_counter()
                if response.status_code != 200:
                    err = f"HTTP {response.status_code}"

                async for line in response.aiter_lines():
                    t_now = time.perf_counter()
                    if not line:
                        continue
                    if line.startswith(":"):
                        # SSE comment/ping
                        if first_event_t is None:
                            first_event_t = t_now
                        continue

                    if line.startswith("data:"):
                        if first_event_t is None:
                            first_event_t = t_now
                        raw = line[5:].strip()
                        try:
                            data = json.loads(raw)
                            evt_type = data.get("type")
                            if evt_type == "status":
                                if first_status_t is None:
                                    first_status_t = t_now
                                status_events.append({
                                    "t_offset_ms": (t_now - t_start) * 1000,
                                    "stage": data.get("stage"),
                                    "label": data.get("label"),
                                })
                            elif evt_type == "token":
                                val = data.get("value", "")
                                if val:
                                    tokens.append(val)
                                    if first_meaningful_token_t is None and val.strip():
                                        first_meaningful_token_t = t_now
                            elif evt_type == "done":
                                done_t = t_now
                                skill_used = data.get("skill_used")
                            elif evt_type == "error":
                                err = data.get("detail", "Stream error")
                        except Exception as json_e:
                            pass

    except Exception as exc:
        err = str(exc)

    t_end = done_t or time.perf_counter()
    full_text = "".join(tokens)

    return {
        "t_start": t_start,
        "first_event_ms": ((first_event_t - t_start) * 1000) if first_event_t else None,
        "first_status_ms": ((first_status_t - t_start) * 1000) if first_status_t else None,
        "first_meaningful_token_ms": ((first_meaningful_token_t - t_start) * 1000) if first_meaningful_token_t else None,
        "total_completion_ms": (t_end - t_start) * 1000,
        "tokens_count": len(tokens),
        "word_count": len(full_text.split()),
        "status_stages": [s["stage"] for s in status_events],
        "skill_used": skill_used,
        "text_preview": full_text[:120].replace("\n", " "),
        "error": err,
    }


def summarize_metric(vals: List[float]) -> Dict[str, Any]:
    if not vals:
        return {"median": 0.0, "min": 0.0, "max": 0.0, "p95": 0.0}
    vals_sorted = sorted(vals)
    n = len(vals_sorted)
    # 95th percentile
    p95_idx = max(0, int(0.95 * n) - 1)
    return {
        "median": round(statistics.median(vals), 2),
        "min": round(min(vals), 2),
        "max": round(max(vals), 2),
        "p95": round(vals_sorted[p95_idx], 2),
    }


async def run_suite_for_case(case_id: str, prompt: str, warm_runs: int = 5):
    print("\n=======================================================")
    print(f"BENCHMARK [{case_id}]: {prompt}")
    print("=======================================================")

    # 1. Cold start
    print("Running Cold Start...")
    cold_res = await measure_stream_request(prompt)
    print(f"  [Cold]: Total={cold_res['total_completion_ms']:.1f}ms | FirstEvent={cold_res['first_event_ms']}ms | FirstToken={cold_res['first_meaningful_token_ms']}ms | Skill={cold_res['skill_used']} | Tokens={cold_res['tokens_count']}")

    await asyncio.sleep(1.0)

    # 2. Warm runs
    warm_results = []
    print(f"Running {warm_runs} Warm Runs...")
    for i in range(1, warm_runs + 1):
        r = await measure_stream_request(prompt)
        print(f"  [Warm #{i}]: Total={r['total_completion_ms']:.1f}ms | FirstEvent={r['first_event_ms']}ms | FirstToken={r['first_meaningful_token_ms']}ms | Skill={r['skill_used']} | Tokens={r['tokens_count']}")
        warm_results.append(r)
        await asyncio.sleep(0.5)

    # Calculate summaries
    warm_totals = [r["total_completion_ms"] for r in warm_results if not r["error"]]
    warm_first_events = [r["first_event_ms"] for r in warm_results if r["first_event_ms"] is not None]
    warm_first_tokens = [r["first_meaningful_token_ms"] for r in warm_results if r["first_meaningful_token_ms"] is not None]

    summary = {
        "case_id": case_id,
        "prompt": prompt,
        "cold": cold_res,
        "warm_runs": warm_results,
        "stats_total": summarize_metric(warm_totals),
        "stats_first_event": summarize_metric(warm_first_events),
        "stats_first_token": summarize_metric(warm_first_tokens),
    }
    return summary


async def main():
    cases = [
        ("A. Simple Question", "What is RISC?"),
        ("B. Web Research", "Verify the Nebius hackathon deadline on Devpost."),
        ("C. Context-Dependent", "What deadlines or tasks do I have scheduled for Nebius or presentations?"),
        ("D. Long Answer", "Compare RISC vs CISC across architecture philosophy, instruction format, pipelining, register counts, power efficiency, and modern hybrid processor implementations."),
    ]

    results = []
    for cid, prompt in cases:
        res = await run_suite_for_case(cid, prompt, warm_runs=WARM_RUNS)
        results.append(res)

    print("\n\n" + "#" * 80)
    print("PHASE 1 BENCHMARK SUMMARY TABLE")
    print("#" * 80)
    print("| Benchmark Case | Cold Total | Warm Median Total | Warm Total Range (Min - Max) | First Event Median | First Meaningful Text Median | Skill Used |")
    print("| :--- | :--- | :--- | :--- | :--- | :--- | :--- |")
    for r in results:
        cold_tot = f"{r['cold']['total_completion_ms']:.1f} ms"
        warm_med = f"**{r['stats_total']['median']:.1f} ms**"
        warm_rng = f"{r['stats_total']['min']:.1f} - {r['stats_total']['max']:.1f} ms"
        fe_med = f"{r['stats_first_event']['median']:.1f} ms"
        ft_med = f"{r['stats_first_token']['median']:.1f} ms"
        skill = r['warm_runs'][0]['skill_used'] or "direct_llm"
        print(f"| {r['case_id']} | {cold_tot} | {warm_med} | {warm_rng} | {fe_med} | {ft_med} | {skill} |")

    # Save to json file for reference
    with open("scripts/benchmark_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print("\nBenchmark results saved to scripts/benchmark_results.json")


if __name__ == "__main__":
    asyncio.run(main())
