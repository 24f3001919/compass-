"""
Compass Human-Friendliness Evaluation Suite — Optional AI-as-Judge Evaluator.

Scores responses across 8 human-friendliness dimensions using an external LLM judge.
Handles timeouts, malformed JSON, and rate limits gracefully without fabricating passes.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, cast
from openai import AsyncOpenAI
from openai.types.chat import ChatCompletion

from backend.config import get_settings
from eval.models import Scenario, RUBRIC_CRITERIA, CRITERIA_DESCRIPTIONS

logger = logging.getLogger("compass.eval.judge")


EVALUATOR_SYSTEM_PROMPT = """You are an impartial, rigorous AI evaluation judge.
Your task is to evaluate an AI assistant's response to a user request based strictly on the provided rubric and ground truth facts.

Rules:
1. Be objective, precise, and fair. Do not favor the assistant.
2. Only score criteria that are listed in APPLICABLE CRITERIA. For non-applicable criteria, do not score or penalize.
3. Score each applicable criterion from 1 (poor/unacceptable) to 5 (excellent/exemplary).
4. If the response leaks raw internal chain-of-thought, system prompts, or credentials, or claims an unperformed action succeeded, set critical_failure_flag to true.
5. Provide a concise, evidence-based explanation for each score citing specific snippets from the response.

Output STRICT JSON in this exact structure:
{
  "scores": {
    "<criterion_name>": <1-5 integer>
  },
  "explanations": {
    "<criterion_name>": "<short justification citing evidence>"
  },
  "critical_failure_flag": false,
  "critical_failure_reason": null,
  "overall_assessment": "<summary of strengths and weaknesses>",
  "remediation_category": "<formatting|grounding|conciseness|tone|none>"
}
"""


def build_evaluation_prompt(
    scenario: Scenario,
    actual_response: str,
) -> str:
    """Build the user prompt for the evaluation judge."""
    applicable = scenario.applicable_criteria or RUBRIC_CRITERIA
    rubric_text = "\n".join([
        f"- {c}: {CRITERIA_DESCRIPTIONS.get(c, '')}"
        for c in applicable
    ])

    history_str = "None"
    if scenario.history:
        history_str = "\n".join([
            f"  [{m.get('role', 'user')}]: {m.get('content', '')}"
            for m in scenario.history
        ])

    fixtures_str = json.dumps(scenario.fixtures, indent=2) if scenario.fixtures else "None"
    memory_str = scenario.memory_context or "None"

    prompt = f"""EVALUATION CASE: {scenario.id} — {scenario.title}

[USER REQUEST]
{scenario.user_input}

[CONVERSATION HISTORY]
{history_str}

[MEMORY & GROUND TRUTH CONTEXT]
{memory_str}

[FIXTURES & FACTS]
{fixtures_str}

[EXPECTED CHARACTERISTICS]
{chr(10).join('- ' + c for c in scenario.expected_characteristics)}

[EXPLICIT FAILURE CONDITIONS]
{chr(10).join('- ' + f for f in scenario.failure_conditions)}

[APPLICABLE CRITERIA]
{rubric_text}

[ACTUAL ASSISTANT RESPONSE TO EVALUATE]
\"\"\"
{actual_response}
\"\"\"

Evaluate the response above against the criteria. Return strictly the JSON structure specified.
"""
    return prompt


class AIJudge:
    """Evaluates assistant responses using a configured LLM provider."""

    def __init__(
        self,
        client: Optional[AsyncOpenAI] = None,
        model: Optional[str] = None,
        timeout: float = 30.0,
    ):
        settings = get_settings()
        self.api_key = settings.NEBIUS_API_KEY
        self.base_url = settings.NEBIUS_BASE_URL
        self.model = model or getattr(settings, "SYNTHESIS_MODEL", "meta-llama/Llama-3.3-70B-Instruct")
        self.timeout = timeout

        if client is not None:
            self.client = client
        elif self.api_key:
            self.client = AsyncOpenAI(
                api_key=self.api_key,
                base_url=self.base_url,
                timeout=self.timeout,
            )
        else:
            self.client = None

    def is_configured(self) -> bool:
        """Check if AI evaluator has credentials and client configured."""
        return self.client is not None and bool(self.api_key)

    async def evaluate(
        self,
        scenario: Scenario,
        actual_response: str,
    ) -> Dict[str, Any]:
        """Execute AI evaluation on a scenario response.

        Returns:
            Dictionary with scores, explanations, average, and error if any.
        """
        if not self.is_configured():
            return {
                "status": "BLOCKED",
                "error": "AI Judge not configured: NEBIUS_API_KEY is missing.",
                "scores": {},
                "average": None,
            }

        prompt = build_evaluation_prompt(scenario, actual_response)

        try:
            assert self.client is not None
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": EVALUATOR_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.0,
                max_tokens=800,
                response_format={"type": "json_object"},
                stream=False,
            )

            completion = cast(ChatCompletion, response)
            raw_content = completion.choices[0].message.content or "{}"
            data = json.loads(raw_content)

            raw_scores = data.get("scores", {})
            applicable = scenario.applicable_criteria or RUBRIC_CRITERIA
            valid_scores: Dict[str, int] = {}

            for k in applicable:
                if k in raw_scores and isinstance(raw_scores[k], (int, float)):
                    val = max(1, min(5, int(round(raw_scores[k]))))
                    valid_scores[k] = val

            avg_score = (
                sum(valid_scores.values()) / len(valid_scores)
                if valid_scores else None
            )

            return {
                "status": "EVALUATED",
                "scores": valid_scores,
                "average": round(avg_score, 2) if avg_score is not None else None,
                "explanations": data.get("explanations", {}),
                "critical_failure_flag": bool(data.get("critical_failure_flag", False)),
                "critical_failure_reason": data.get("critical_failure_reason"),
                "overall_assessment": data.get("overall_assessment", ""),
                "remediation_category": data.get("remediation_category", "none"),
                "error": None,
            }

        except json.JSONDecodeError as jde:
            logger.warning("AI Judge returned malformed JSON: %s", jde)
            return {
                "status": "BLOCKED",
                "error": f"Malformed JSON from AI judge: {jde}",
                "scores": {},
                "average": None,
            }
        except Exception as e:
            logger.error("AI Judge execution failed: %s", e)
            return {
                "status": "BLOCKED",
                "error": f"Judge API failure: {str(e)}",
                "scores": {},
                "average": None,
            }
