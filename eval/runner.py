"""
Compass Human-Friendliness Evaluation Suite — CLI Runner & Pipeline Executor.

Executes evaluation scenarios against the actual Compass response pipeline
(via orchestrator.handle_message and skills handlers).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

# Ensure stdout/stderr safely handle utf-8 on Windows cp1252 consoles
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from eval.deterministic import evaluate_deterministic, sanitize_diagnostic_output
from eval.judge import AIJudge
from eval.models import EvaluationReport, Scenario, ScenarioResult
from eval.reporter import compare_reports, generate_json_report, generate_markdown_summary
from eval.scenarios import get_all_scenarios


def get_git_revision() -> str:
    """Safely obtain current Git commit hash or fallback."""
    try:
        res = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5.0,
            check=False,
        )
        if res.returncode == 0:
            return res.stdout.strip()
    except Exception:
        pass
    return "workspace-eval"


async def execute_scenario_pipeline(
    scenario: Scenario,
    ai_judge: Optional[AIJudge] = None,
) -> ScenarioResult:
    """Execute scenario through the actual Compass response pipeline."""
    import backend.orchestrator as orchestrator
    from backend.config import get_settings

    start_time = time.perf_counter()
    fixtures = scenario.fixtures or {}

    # Setup controlled pool/connection mock if fixtures are specified
    mock_pool = None
    if "tasks" in fixtures or fixtures.get("simulate_db_failure") or fixtures.get("simulate_db_failure_with_dsn"):
        if fixtures.get("simulate_db_failure_with_dsn"):
            mock_pool = MagicMock()
            mock_pool.acquire.side_effect = Exception(
                "connection to server at 'postgres://admin:secret_pass123@db.prod.internal:5432/compass_prod' failed: Connection refused"
            )
        elif fixtures.get("simulate_db_failure"):
            mock_pool = MagicMock()
            mock_pool.acquire.side_effect = Exception("database connection pool exhausted")
        else:
            mock_tasks = fixtures["tasks"]
            mock_conn = AsyncMock()
            mock_conn.fetch = AsyncMock(return_value=mock_tasks)
            mock_conn.fetchrow = AsyncMock(return_value=None)
            mock_conn.execute = AsyncMock(return_value=None)
            mock_pool = MagicMock()
            mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
            mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    pool_patch = (
        patch("backend.orchestrator.get_pool", new_callable=AsyncMock, return_value=mock_pool)
        if mock_pool is not None
        else patch("backend.orchestrator.get_pool", side_effect=orchestrator.get_pool)
    )

    result_dict: Dict[str, Any] = {}
    err_msg: Optional[str] = None
    skill_used: Optional[str] = None

    try:
        with pool_patch:
            result_dict = await orchestrator.handle_message(
                conversation_id=f"eval-{scenario.id.lower()}",
                message=scenario.user_input,
                history=scenario.history,
                memory_context=scenario.memory_context,
                persist=False,
            )
            raw_response = result_dict.get("response") or result_dict.get("message") or ""
            success = result_dict.get("success", True)
            skill_used = result_dict.get("skill_used")
            if not result_dict.get("success"):
                err_msg = result_dict.get("error")
    except Exception as exc:
        raw_response = f"Pipeline execution error: {exc}"
        success = False
        err_msg = str(exc)

    latency_ms = int((time.perf_counter() - start_time) * 1000)

    # Deterministic Evaluation
    det_pass, det_failures, crit_failures = evaluate_deterministic(
        scenario=scenario,
        response_text=raw_response,
        success=success,
        payload=result_dict,
    )

    # Optional AI Judge Evaluation
    ai_result: Optional[Dict[str, Any]] = None
    ai_scores: Dict[str, int] = {}
    ai_average: Optional[float] = None

    if ai_judge and ai_judge.is_configured():
        ai_result = await ai_judge.evaluate(scenario, raw_response)
        ai_scores = ai_result.get("scores", {})
        ai_average = ai_result.get("average")
        if ai_result.get("critical_failure_flag"):
            crit_failures.append(f"AI Judge Critical Failure: {ai_result.get('critical_failure_reason', 'Unacceptable response')}")

    # Final Status Gate
    has_crit = len(crit_failures) > 0
    if has_crit:
        status = "FAIL"
    elif not det_pass:
        status = "FAIL"
    elif ai_result and ai_result.get("status") == "BLOCKED":
        status = "BLOCKED"
    elif ai_average is not None and ai_average < 3.0:
        status = "FAIL"
    else:
        status = "PASS"

    sanitized = sanitize_diagnostic_output(raw_response)

    return ScenarioResult(
        scenario_id=scenario.id,
        category=scenario.category,
        title=scenario.title,
        status=status,
        deterministic_pass=det_pass,
        deterministic_failures=det_failures,
        ai_evaluation=ai_result,
        ai_scores=ai_scores,
        ai_average=ai_average,
        critical_failure=has_crit,
        critical_failure_details=crit_failures,
        raw_response=raw_response,
        sanitized_response=sanitized,
        latency_ms=latency_ms,
        skill_used=skill_used,
        error_message=err_msg,
    )


async def run_evaluation_suite(
    scenario_id_filter: Optional[str] = None,
    category_filter: Optional[str] = None,
    use_ai_judge: bool = False,
    save_baseline: bool = False,
    output_json: Optional[str] = None,
    output_md: Optional[str] = None,
) -> EvaluationReport:
    """Run full evaluation suite and compile structured report."""
    all_scenarios = get_all_scenarios()

    filtered = all_scenarios
    if scenario_id_filter:
        filtered = [s for s in filtered if s.id.lower() == scenario_id_filter.lower()]
    if category_filter:
        filtered = [s for s in filtered if s.category.upper() == category_filter.upper()]

    if not filtered:
        raise ValueError(f"No scenarios found matching filter (scenario='{scenario_id_filter}', category='{category_filter}')")

    judge = AIJudge() if use_ai_judge else None

    results: List[ScenarioResult] = []
    print("\n=======================================================")
    print("  Compass Human-Friendliness Evaluation Suite")
    print(f"  Scenarios to run: {len(filtered)}")
    print(f"  AI Judge enabled: {use_ai_judge and (judge is not None and judge.is_configured())}")
    print("=======================================================\n")

    for idx, sc in enumerate(filtered, 1):
        print(f"[{idx:02d}/{len(filtered):02d}] Running {sc.id} ({sc.category}) - {sc.title[:45]}...", end=" ", flush=True)
        res = await execute_scenario_pipeline(sc, ai_judge=judge)
        results.append(res)
        color = "\033[92m" if res.status == "PASS" else "\033[91m"
        reset = "\033[0m"
        print(f"{color}{res.status}{reset} ({res.latency_ms}ms)")
        if res.critical_failure:
            for c_detail in res.critical_failure_details:
                print(f"     [CRITICAL] {c_detail}")
        elif res.deterministic_failures:
            print(f"     [FAIL] {res.deterministic_failures[0]}")

    # Compile Summary
    total = len(results)
    passed = sum(1 for r in results if r.status == "PASS")
    failed = sum(1 for r in results if r.status == "FAIL")
    blocked = sum(1 for r in results if r.status == "BLOCKED")
    not_eval = sum(1 for r in results if r.status == "NOT_EVALUATED")
    crit_count = sum(1 for r in results if r.critical_failure)

    det_passed = sum(1 for r in results if r.deterministic_pass)
    det_rate = (det_passed / total * 100) if total > 0 else 0.0

    ai_averages = [r.ai_average for r in results if r.ai_average is not None]
    overall_ai_avg = (sum(ai_averages) / len(ai_averages)) if ai_averages else None

    cat_summaries: Dict[str, Dict[str, Any]] = {}
    for cat in ["A", "B", "C", "D", "E", "F", "G", "H"]:
        cat_res = [r for r in results if r.category == cat]
        c_tot = len(cat_res)
        c_pass = sum(1 for r in cat_res if r.status == "PASS")
        c_fail = sum(1 for r in cat_res if r.status == "FAIL")
        cat_summaries[cat] = {
            "total": c_tot,
            "passed": c_pass,
            "failed": c_fail,
            "pass_rate": (c_pass / c_tot * 100) if c_tot > 0 else 0.0,
        }

    report = EvaluationReport(
        git_commit=get_git_revision(),
        total_scenarios=total,
        passed=passed,
        failed=failed,
        blocked=blocked,
        not_evaluated=not_eval,
        critical_failures_count=crit_count,
        deterministic_pass_rate=det_rate,
        overall_ai_average=overall_ai_avg,
        category_summaries=cat_summaries,
        scenario_results=[
            {
                "scenario_id": r.scenario_id,
                "category": r.category,
                "title": r.title,
                "status": r.status,
                "deterministic_pass": r.deterministic_pass,
                "deterministic_failures": r.deterministic_failures,
                "ai_scores": r.ai_scores,
                "ai_average": r.ai_average,
                "critical_failure": r.critical_failure,
                "critical_failure_details": r.critical_failure_details,
                "latency_ms": r.latency_ms,
                "skill_used": r.skill_used,
                "error_message": r.error_message,
                "sanitized_response": r.sanitized_response[:300],
            }
            for r in results
        ],
    )

    # Determine Output Paths
    results_dir = Path(__file__).resolve().parent.parent / "eval_results"
    results_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    json_path = output_json or (results_dir / f"eval_report_{stamp}.json")
    md_path = output_md or (results_dir / f"eval_report_{stamp}.md")

    if save_baseline:
        json_path = results_dir / "baseline_report.json"
        md_path = results_dir / "baseline_report.md"

    generate_json_report(report, json_path)
    generate_markdown_summary(report, md_path)

    print("\n-------------------------------------------------------")
    print(f"  Summary: {passed}/{total} Passed ({det_rate:.1f}%) | Critical Failures: {crit_count}")
    print(f"  JSON Report: {json_path}")
    print(f"  Markdown Report: {md_path}")
    print("-------------------------------------------------------\n")

    return report


def main():
    """CLI Entry point."""
    parser = argparse.ArgumentParser(description="Compass Human-Friendliness Evaluation Suite")
    parser.add_argument("--scenario", type=str, help="Run specific scenario by ID (e.g. SCENARIO_B1)")
    parser.add_argument("--category", type=str, help="Run specific category (A, B, C, D, E, F, G, H)")
    parser.add_argument("--ai-judge", action="store_true", help="Invoke optional AI-as-Judge evaluator")
    parser.add_argument("--save-baseline", action="store_true", help="Save report as eval_results/baseline_report.json")
    parser.add_argument("--compare", nargs=2, metavar=("BASELINE", "CURRENT"), help="Compare two report JSON files")
    parser.add_argument("--json-output", type=str, help="Custom path for JSON output")
    parser.add_argument("--md-output", type=str, help="Custom path for Markdown output")

    args = parser.parse_args()

    if args.compare:
        base_file, curr_file = args.compare
        with open(base_file, encoding="utf-8") as bf, open(curr_file, encoding="utf-8") as cf:
            b_data = json.load(bf)
            c_data = json.load(cf)
        diff = compare_reports(b_data, c_data)
        print("\n=======================================================")
        print("  Evaluation Baseline Comparison")
        print("=======================================================")
        print(f"  Pass Rate Delta: {diff['pass_rate_delta']:+.2f}%")
        print(f"  Passed Count Delta: {diff['passed_delta']:+d}")
        print(f"  Critical Failures Delta: {diff['critical_failures_delta']:+d}")
        if diff["regressions"]:
            print("\n  [REGRESSIONS]:")
            for reg in diff["regressions"]:
                print(f"  - {reg}")
        if diff["improvements"]:
            print("\n  [IMPROVEMENTS]:")
            for imp in diff["improvements"]:
                print(f"  - {imp}")
        print("=======================================================\n")
        return

    asyncio.run(run_evaluation_suite(
        scenario_id_filter=args.scenario,
        category_filter=args.category,
        use_ai_judge=args.ai_judge,
        save_baseline=args.save_baseline,
        output_json=args.json_output,
        output_md=args.md_output,
    ))


if __name__ == "__main__":
    main()
