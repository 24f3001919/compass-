"""
Compass Human-Friendliness Evaluation Suite — Reporting & Baseline Comparison.

Produces:
1. Machine-readable JSON reports.
2. Human-readable Markdown executive summaries.
3. Comparative analysis between baseline and current runs.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List
from eval.models import EvaluationReport, ScenarioResult


def generate_json_report(report: EvaluationReport, filepath: str | Path) -> None:
    """Save machine-readable JSON evaluation report."""
    path = Path(filepath)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report.to_dict(), f, indent=2)


def generate_markdown_summary(report: EvaluationReport, filepath: str | Path) -> str:
    """Generate human-readable Markdown summary and save to disk."""
    lines: List[str] = []

    lines.append("# Compass Human-Friendliness Evaluation Report")
    lines.append("")
    lines.append(f"- **Timestamp:** `{report.timestamp}`")
    lines.append(f"- **Git Revision:** `{report.git_commit}`")
    lines.append(f"- **Evaluation Version:** `{report.evaluation_version}`")
    lines.append("")

    lines.append("## Executive Summary")
    lines.append("")
    lines.append("| Metric | Value |")
    lines.append("| :--- | :--- |")
    lines.append(f"| **Total Scenarios** | {report.total_scenarios} |")
    lines.append(f"| **Passed** | {report.passed} |")
    lines.append(f"| **Failed** | {report.failed} |")
    lines.append(f"| **Blocked / Unevaluated** | {report.blocked + report.not_evaluated} |")
    lines.append(f"| **Critical Failures** | {report.critical_failures_count} |")
    lines.append(f"| **Deterministic Pass Rate** | {report.deterministic_pass_rate:.1f}% |")
    if report.overall_ai_average is not None:
        lines.append(f"| **AI Judge Average (1-5)** | {report.overall_ai_average:.2f} / 5.0 |")
    lines.append("")

    # Category Breakdown
    lines.append("## Category Breakdown")
    lines.append("")
    lines.append("| Category | Total | Passed | Failed | Pass Rate |")
    lines.append("| :--- | :---: | :---: | :---: | :---: |")

    cat_names = {
        "A": "Simple Questions & Explanations",
        "B": "Task Planning & Prioritization",
        "C": "Natural Conversation & Empathy",
        "D": "Follow-up Questions & Context",
        "E": "Conciseness & Formatting",
        "F": "Missing Info & Uncertainty",
        "G": "Tool Execution & Errors",
        "H": "Reasoning & Security Leakage",
    }

    for cat, name in cat_names.items():
        summary = report.category_summaries.get(cat, {"total": 0, "passed": 0, "failed": 0})
        total = summary["total"]
        passed = summary["passed"]
        failed = summary["failed"]
        rate = (passed / total * 100) if total > 0 else 0.0
        lines.append(f"| **{cat} — {name}** | {total} | {passed} | {failed} | {rate:.1f}% |")
    lines.append("")

    # Critical Failures Section
    if report.critical_failures_count > 0:
        lines.append("## ⚠️ Critical Failures")
        lines.append("")
        for res in report.scenario_results:
            if res.get("critical_failure"):
                lines.append(f"### {res['scenario_id']} — {res['title']}")
                for detail in res.get("critical_failure_details", []):
                    lines.append(f"- 🔴 {detail}")
                lines.append("")

    # Scenario Inventory Table
    lines.append("## Scenario Results Detail")
    lines.append("")
    lines.append("| Scenario ID | Category | Title | Status | Latency | Deterministic | AI Avg | Notes |")
    lines.append("| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :--- |")

    for res in report.scenario_results:
        sid = res["scenario_id"]
        cat = res["category"]
        title = res["title"]
        status = res["status"]
        lat = f"{res.get('latency_ms', 0)}ms"
        det = "PASS" if res.get("deterministic_pass") else "FAIL"
        ai_avg = f"{res.get('ai_average'):.2f}" if res.get("ai_average") is not None else "—"
        
        notes = []
        if res.get("deterministic_failures"):
            notes.append(res["deterministic_failures"][0][:50])
        elif res.get("error_message"):
            notes.append(res["error_message"][:50])
        else:
            notes.append("Clean pass")

        note_str = "; ".join(notes)
        lines.append(f"| `{sid}` | {cat} | {title} | **{status}** | {lat} | {det} | {ai_avg} | {note_str} |")

    lines.append("")
    content = "\n".join(lines)

    path = Path(filepath)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

    return content


def compare_reports(
    baseline_dict: Dict[str, Any],
    current_dict: Dict[str, Any],
) -> Dict[str, Any]:
    """Compare a baseline evaluation report with a current evaluation report."""
    base_passed = baseline_dict.get("passed", 0)
    curr_passed = current_dict.get("passed", 0)
    base_rate = baseline_dict.get("deterministic_pass_rate", 0.0)
    curr_rate = current_dict.get("deterministic_pass_rate", 0.0)
    base_crit = baseline_dict.get("critical_failures_count", 0)
    curr_crit = current_dict.get("critical_failures_count", 0)

    base_scenarios = {r["scenario_id"]: r for r in baseline_dict.get("scenario_results", [])}
    curr_scenarios = {r["scenario_id"]: r for r in current_dict.get("scenario_results", [])}

    regressions: List[str] = []
    improvements: List[str] = []

    for sid, curr in curr_scenarios.items():
        base = base_scenarios.get(sid)
        if not base:
            continue
        if base.get("status") == "PASS" and curr.get("status") != "PASS":
            regressions.append(f"{sid}: regressed from PASS to {curr.get('status')}")
        elif base.get("status") != "PASS" and curr.get("status") == "PASS":
            improvements.append(f"{sid}: improved from {base.get('status')} to PASS")

    return {
        "pass_rate_delta": round(curr_rate - base_rate, 2),
        "passed_delta": curr_passed - base_passed,
        "critical_failures_delta": curr_crit - base_crit,
        "regressions": regressions,
        "improvements": improvements,
        "baseline_timestamp": baseline_dict.get("timestamp"),
        "current_timestamp": current_dict.get("timestamp"),
    }
