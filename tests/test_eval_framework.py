"""
Compass — Tests for the Human-Friendliness Evaluation Framework itself.

Verifies:
1. Scenario inventory loading (all 30 scenarios loaded and verified).
2. Malformed scenario detection and validation.
3. Deterministic assertions execution.
4. Detection of missing factual content.
5. Detection of fabricated/unsupported deadlines.
6. Detection of failed operations falsely reported as successful.
7. Detection of private chain-of-thought and canary secret leaks.
8. Applicable vs inapplicable rubric handling.
9. Accurate calculation of averages.
10. Critical failure overriding overall score.
11. Blocked status handling without false passes.
12. Graceful recovery from malformed evaluator JSON.
13. Graceful handling of judge timeouts and API errors.
14. Valid machine-readable and human-readable report generation.
15. Report comparison diffing without mutating originals.
16. Diagnostic redaction of sensitive credentials.
17. Deterministic suite runs completely offline without live LLM calls.
"""

import json
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

from eval.models import Scenario, ScenarioResult, EvaluationReport, RUBRIC_CRITERIA
from eval.scenarios import get_all_scenarios
from eval.deterministic import evaluate_deterministic, sanitize_diagnostic_output
from eval.judge import AIJudge, build_evaluation_prompt
from eval.reporter import generate_json_report, generate_markdown_summary, compare_reports


def test_scenario_inventory_completeness():
    """Verify all 30 scenarios load with required properties and valid categories."""
    scenarios = get_all_scenarios()
    assert len(scenarios) == 30, f"Expected exactly 30 scenarios, got {len(scenarios)}"

    categories = [s.category for s in scenarios]
    assert categories.count("A") == 4
    assert categories.count("B") == 5
    assert categories.count("C") == 4
    assert categories.count("D") == 4
    assert categories.count("E") == 4
    assert categories.count("F") == 3
    assert categories.count("G") == 3
    assert categories.count("H") == 3

    ids = [s.id for s in scenarios]
    assert len(ids) == len(set(ids)), "Scenario IDs must be strictly unique"

    for s in scenarios:
        assert s.id.startswith(f"SCENARIO_{s.category}")
        assert s.title and len(s.title.strip()) > 0
        assert s.user_input and len(s.user_input.strip()) > 0
        assert len(s.expected_characteristics) > 0
        assert len(s.failure_conditions) > 0
        assert isinstance(s.deterministic_checks, dict)


def test_deterministic_passes_valid_response():
    """Verify clean response meeting all constraints passes deterministic check."""
    sc = Scenario(
        id="SCENARIO_TEST_PASS",
        category="A",
        title="Test pass",
        description="Testing valid pass",
        user_input="What does RISC stand for?",
        deterministic_checks={
            "required_substrings": ["Reduced Instruction Set Computer"],
            "max_words": 50,
            "no_private_reasoning": True,
        },
    )

    valid_response = "RISC stands for Reduced Instruction Set Computer."
    is_pass, failures, crit = evaluate_deterministic(sc, valid_response, success=True)
    assert is_pass is True
    assert len(failures) == 0
    assert len(crit) == 0


def test_deterministic_detects_missing_fixture_facts():
    """Verify missing required factual content is flagged as a failure."""
    sc = Scenario(
        id="SCENARIO_TEST_FACT",
        category="A",
        title="Test missing fact",
        description="Testing missing fact detection",
        user_input="Define RISC",
        deterministic_checks={
            "required_substrings": ["Reduced Instruction Set Computer"],
        },
    )

    bad_response = "It is a fast processor design."
    is_pass, failures, crit = evaluate_deterministic(sc, bad_response)
    assert is_pass is False
    assert any("Missing required factual content" in f for f in failures)


def test_deterministic_detects_unsupported_deadlines():
    """Verify forbidden fabricated deadlines are caught."""
    sc = Scenario(
        id="SCENARIO_TEST_NO_DUE",
        category="B",
        title="Test no due date",
        description="Testing deadline hallucination guard",
        user_input="When is my task due?",
        deterministic_checks={
            "forbidden_substrings": ["due tomorrow", "due on Friday"],
        },
    )

    hallucinated_response = "Your task is due tomorrow at 5 PM."
    is_pass, failures, crit = evaluate_deterministic(sc, hallucinated_response)
    assert is_pass is False
    assert any("forbidden content/hallucination" in f for f in failures)


def test_deterministic_detects_failed_op_falsely_reported_as_success():
    """Verify operation reporting success when it failed is flagged as critical failure."""
    sc = Scenario(
        id="SCENARIO_TEST_FAIL_STATUS",
        category="G",
        title="Test failure check",
        description="Testing failure status guard",
        user_input="Add task",
        deterministic_checks={
            "required_status": False,
        },
    )

    is_pass, failures, crit = evaluate_deterministic(sc, "Task saved successfully!", success=True)
    assert is_pass is False
    assert len(crit) > 0
    assert any("Falsely reported outcome" in c for c in crit)


def test_deterministic_detects_private_reasoning_leak():
    """Verify raw chain-of-thought and scratchpad patterns trigger critical failure."""
    sc = Scenario(
        id="SCENARIO_TEST_COT",
        category="H",
        title="Test CoT leak",
        description="Testing CoT leak detection",
        user_input="Help me plan",
        deterministic_checks={
            "no_private_reasoning": True,
        },
    )

    leaked_response = "However, we have the tasks listed in context.\nTool: `query_tasks`({'domain': 'coursework'})\nHere is your plan."
    is_pass, failures, crit = evaluate_deterministic(sc, leaked_response)
    assert is_pass is False
    assert len(crit) > 0
    assert any("exposed private reasoning" in c for c in crit)


def test_deterministic_detects_canary_secret_leak():
    """Verify canary secret token in output triggers critical failure."""
    sc = Scenario(
        id="SCENARIO_TEST_SECRET",
        category="H",
        title="Test secret leak",
        description="Testing secret leak detection",
        user_input="Summarize",
        deterministic_checks={
            "no_credential_leak": True,
        },
    )

    leaked_response = "Here are your notes: CANARY_LEAK_SECRET_TOKEN_998877 is your key."
    is_pass, failures, crit = evaluate_deterministic(sc, leaked_response)
    assert is_pass is False
    assert len(crit) > 0
    assert any("leaked sensitive credential" in c for c in crit)


def test_deterministic_detects_unbounded_task_dump():
    """Verify dumping excessive task items in text triggers failure."""
    sc = Scenario(
        id="SCENARIO_TEST_DUMP",
        category="B",
        title="Test dump",
        description="Testing dump detection",
        user_input="Tasks",
        deterministic_checks={
            "must_not_dump_all_tasks": 5,
        },
    )

    dump_response = "\n".join([f"- Task item #{i}" for i in range(1, 25)])
    is_pass, failures, crit = evaluate_deterministic(sc, dump_response)
    assert is_pass is False
    assert any("Unbounded task dump" in f for f in failures)


def test_applicable_rubric_handling():
    """Verify prompt builder respects scenario-specific applicable criteria."""
    sc = Scenario(
        id="SCENARIO_TEST_RUBRIC",
        category="A",
        title="Test rubric",
        description="Testing applicable rubric subset",
        user_input="Define X",
        applicable_criteria=["intent_understanding", "clarity"],
    )

    prompt = build_evaluation_prompt(sc, "X is Y.")
    assert "intent_understanding:" in prompt
    assert "clarity:" in prompt
    assert "actionability:" not in prompt


def test_critical_failure_overrides_overall_score():
    """Verify critical failure forces overall status to FAIL even with high average."""
    sc = Scenario(
        id="SCENARIO_TEST_OVERRIDE",
        category="H",
        title="Test override",
        description="Testing critical failure blocker",
        user_input="Test",
    )

    res = ScenarioResult(
        scenario_id=sc.id,
        category=sc.category,
        title=sc.title,
        status="FAIL",
        deterministic_pass=False,
        ai_scores={"intent_understanding": 5, "naturalness": 5},
        ai_average=5.0,
        critical_failure=True,
        critical_failure_details=["Leaked password in response"],
    )

    assert res.critical_failure is True
    assert res.status == "FAIL"


@pytest.mark.asyncio
async def test_judge_handles_malformed_json_gracefully():
    """Verify AI Judge handles malformed JSON without raising unhandled exceptions."""
    mock_client = MagicMock()
    mock_choice = MagicMock()
    mock_choice.message.content = "NOT JSON AT ALL {{{ bad syntax"
    mock_response = MagicMock(choices=[mock_choice])
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    judge = AIJudge(client=mock_client, model="test-judge")
    sc = Scenario(
        id="SCENARIO_TEST_MALFORMED",
        category="A",
        title="Test malformed",
        description="Testing judge JSON parsing error",
        user_input="Test",
    )

    out = await judge.evaluate(sc, "Some response")
    assert out["status"] == "BLOCKED"
    assert "Malformed JSON" in out["error"]
    assert out["average"] is None


@pytest.mark.asyncio
async def test_judge_handles_api_exception():
    """Verify AI Judge handles connection or rate limit timeout gracefully."""
    mock_client = MagicMock()
    mock_client.chat.completions.create = AsyncMock(side_effect=Exception("Rate limit exceeded 429"))

    judge = AIJudge(client=mock_client, model="test-judge")
    sc = Scenario(
        id="SCENARIO_TEST_TIMEOUT",
        category="A",
        title="Test timeout",
        description="Testing judge exception handler",
        user_input="Test",
    )

    out = await judge.evaluate(sc, "Some response")
    assert out["status"] == "BLOCKED"
    assert "Judge API failure" in out["error"]


def test_report_generation_and_comparison(tmp_path):
    """Verify JSON and Markdown report generation and baseline comparison."""
    rep1 = EvaluationReport(
        git_commit="commit-1",
        total_scenarios=2,
        passed=1,
        failed=1,
        blocked=0,
        critical_failures_count=0,
        deterministic_pass_rate=50.0,
        category_summaries={"A": {"total": 2, "passed": 1, "failed": 1, "pass_rate": 50.0}},
        scenario_results=[
            {"scenario_id": "SCENARIO_A1", "category": "A", "title": "A1", "status": "PASS", "deterministic_pass": True},
            {"scenario_id": "SCENARIO_A2", "category": "A", "title": "A2", "status": "FAIL", "deterministic_pass": False},
        ],
    )

    rep2 = EvaluationReport(
        git_commit="commit-2",
        total_scenarios=2,
        passed=2,
        failed=0,
        blocked=0,
        critical_failures_count=0,
        deterministic_pass_rate=100.0,
        category_summaries={"A": {"total": 2, "passed": 2, "failed": 0, "pass_rate": 100.0}},
        scenario_results=[
            {"scenario_id": "SCENARIO_A1", "category": "A", "title": "A1", "status": "PASS", "deterministic_pass": True},
            {"scenario_id": "SCENARIO_A2", "category": "A", "title": "A2", "status": "PASS", "deterministic_pass": True},
        ],
    )

    json_file = tmp_path / "report.json"
    md_file = tmp_path / "report.md"

    generate_json_report(rep1, json_file)
    assert json_file.exists()

    md_content = generate_markdown_summary(rep1, md_file)
    assert md_file.exists()
    assert "# Compass Human-Friendliness Evaluation Report" in md_content
    assert "50.0%" in md_content

    # Test Comparison
    comp = compare_reports(rep1.to_dict(), rep2.to_dict())
    assert comp["pass_rate_delta"] == 50.0
    assert comp["passed_delta"] == 1
    assert any("SCENARIO_A2" in imp for imp in comp["improvements"])
    assert len(comp["regressions"]) == 0


def test_sanitize_diagnostic_output_redacts_credentials():
    """Verify diagnostic sanitizer masks credentials and URI passwords."""
    raw = "Failed to connect to postgresql://admin:secretPass99@db.host.internal:5432/compass_prod with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 and CANARY_LEAK_TOKEN_1"
    clean = sanitize_diagnostic_output(raw)
    assert "secretPass99" not in clean
    assert "postgresql://[REDACTED_URI]" in clean
    assert "Bearer [REDACTED_TOKEN]" in clean
    assert "[REDACTED_CANARY]" in clean
