"""Regression tests for CodeQL Security Alerts #112, #113, #114, #115, #116.

Verifies:
1. Alert #114 (py/polynomial-redos in router_helpers.py: extract_claim_and_entity_from_text)
2. Alert #112 (py/polynomial-redos in career_resume.py: _is_tech_stack_line)
3. Alert #113 (py/polynomial-redos in career_resume.py: date normalization in parse_uploaded_resume_text)
4. Alerts #115 & #116 (js/clear-text-cookie in baseClient.js: static Secure attribute presence)
"""

import time
import re
from pathlib import Path
from backend.router_helpers import extract_claim_and_entity_from_text
from backend.services.career_resume import _is_tech_stack_line, parse_uploaded_resume_text


def test_alert_114_redos_protection_bracket_strip():
    """Ensure extract_claim_and_entity_from_text does not backtrack polynomially on repetitions of '[['."""
    # 20,000 repetitions of '[[' without closing brackets
    pathological_input = "[[" * 20000 + " trailing claim"
    start = time.perf_counter()
    claim, entity = extract_claim_and_entity_from_text(pathological_input)
    elapsed = time.perf_counter() - start

    assert elapsed < 0.1, f"Polynomial ReDoS detected: took {elapsed:.4f}s"
    # Normal functional check
    valid_claim, _ = extract_claim_and_entity_from_text("[[modes: fact-check]] Hackathon deadline on Nov 5")
    assert valid_claim == "Hackathon deadline on Nov 5"


def test_alert_112_redos_protection_tech_stack_line():
    """Ensure _is_tech_stack_line does not backtrack polynomially on repetitions of whitespace/tabs."""
    pathological_input = "tools" + "\t" * 30000 + "Python, Docker"
    start = time.perf_counter()
    result = _is_tech_stack_line(pathological_input)
    elapsed = time.perf_counter() - start

    assert elapsed < 0.05, f"Polynomial ReDoS detected: took {elapsed:.4f}s"
    assert result == "Python, Docker"

    # Functional checks
    assert _is_tech_stack_line("Tech Stack: React, Node.js") == "React, Node.js"
    assert _is_tech_stack_line("Technologies: Python, SQL") == "Python, SQL"
    assert _is_tech_stack_line("Non-tech line here") is None


def test_alert_113_redos_protection_date_normalization():
    """Ensure date range normalization in parse_uploaded_resume_text does not backtrack on repeated spaces."""
    pathological_date = "Jan 2021" + " " * 30000 + "to" + " " * 30000 + "May 2023"
    resume_text = f"""
EXPERIENCE
Software Engineer, Acme Corp | {pathological_date}
- Developed high scale backend APIs
"""
    start = time.perf_counter()
    parsed = parse_uploaded_resume_text(resume_text)
    elapsed = time.perf_counter() - start

    assert elapsed < 0.1, f"Polynomial ReDoS detected: took {elapsed:.4f}s"
    assert len(parsed.experience) == 1
    assert parsed.experience[0].start_date == "Jan 2021"
    assert parsed.experience[0].end_date == "May 2023"


def test_alerts_115_and_116_cookie_secure_attribute_invariant():
    """Ensure baseClient.js cookie writes include static Secure flag and match CodeQL expectations."""
    client_path = Path(__file__).resolve().parent.parent / "frontend" / "src" / "api" / "baseClient.js"
    content = client_path.read_text(encoding="utf-8")

    # Invariant: Every document.cookie assignment for compass_user_id must contain '; Secure;'
    cookie_writes = [
        line.strip()
        for line in content.splitlines()
        if "document.cookie" in line and "compass_user_id" in line
    ]
    assert len(cookie_writes) >= 3, "Expected at least 3 cookie cleanup writes in baseClient.js"

    for cw in cookie_writes:
        assert "Secure;" in cw, f"Cookie write missing static 'Secure;' flag: {cw}"
