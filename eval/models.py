"""
Compass Human-Friendliness Evaluation Suite — Data Models and Rubrics.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


RUBRIC_CRITERIA = [
    "intent_understanding",
    "naturalness",
    "clarity",
    "appropriate_conciseness",
    "actionability",
    "groundedness",
    "context_awareness",
    "tone_appropriateness",
]

CRITERIA_DESCRIPTIONS = {
    "intent_understanding": "Answers the user's actual question and meets their implicit goal (1-5).",
    "naturalness": "Reads naturally and conversationally without sounding robotic or awkward (1-5).",
    "clarity": "Well-organized, readable, and free of confusing jargon or structure (1-5).",
    "appropriate_conciseness": "Appropriate information density: not too verbose, not omitting essentials (1-5).",
    "actionability": "Clear, practical next steps and guidance when recommendations are needed (1-5).",
    "groundedness": "Accurate, consistent with supplied facts, and honest about missing info (1-5).",
    "context_awareness": "Seamlessly integrates prior messages and workspace facts without friction (1-5).",
    "tone_appropriateness": "Respectful, warm, empathetic when appropriate, not artificially cheery (1-5).",
}


@dataclass
class Scenario:
    """Evaluation test case specification."""
    id: str
    category: str  # A, B, C, D, E, F, G, H
    title: str
    description: str
    user_input: str
    history: Optional[List[Dict[str, str]]] = None
    memory_context: Optional[str] = None
    fixtures: Optional[Dict[str, Any]] = None
    expected_characteristics: List[str] = field(default_factory=list)
    failure_conditions: List[str] = field(default_factory=list)
    deterministic_checks: Dict[str, Any] = field(default_factory=dict)
    applicable_criteria: List[str] = field(default_factory=lambda: list(RUBRIC_CRITERIA))


@dataclass
class ScenarioResult:
    """Outcome of evaluating one scenario."""
    scenario_id: str
    category: str
    title: str
    status: str  # PASS, FAIL, BLOCKED, NOT_EVALUATED
    deterministic_pass: bool = False
    deterministic_failures: List[str] = field(default_factory=list)
    ai_evaluation: Optional[Dict[str, Any]] = None
    ai_scores: Dict[str, int] = field(default_factory=dict)
    ai_average: Optional[float] = None
    critical_failure: bool = False
    critical_failure_details: List[str] = field(default_factory=list)
    raw_response: str = ""
    sanitized_response: str = ""
    latency_ms: int = 0
    skill_used: Optional[str] = None
    error_message: Optional[str] = None


@dataclass
class EvaluationReport:
    """Complete evaluation report aggregating all scenarios."""
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    git_commit: str = "unknown"
    evaluation_version: str = "1.0.0"
    total_scenarios: int = 0
    passed: int = 0
    failed: int = 0
    blocked: int = 0
    not_evaluated: int = 0
    critical_failures_count: int = 0
    deterministic_pass_rate: float = 0.0
    overall_ai_average: Optional[float] = None
    category_summaries: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    scenario_results: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "git_commit": self.git_commit,
            "evaluation_version": self.evaluation_version,
            "total_scenarios": self.total_scenarios,
            "passed": self.passed,
            "failed": self.failed,
            "blocked": self.blocked,
            "not_evaluated": self.not_evaluated,
            "critical_failures_count": self.critical_failures_count,
            "deterministic_pass_rate": round(self.deterministic_pass_rate, 2),
            "overall_ai_average": round(self.overall_ai_average, 2) if self.overall_ai_average is not None else None,
            "category_summaries": self.category_summaries,
            "scenario_results": self.scenario_results,
        }
