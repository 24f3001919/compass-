"""
Tests verifying CodeQL security remediations:
- URL substring sanitization (py/incomplete-url-substring-sanitization)
- Safe username extraction from GitHub URLs
- Safe social link classification in resume parser
- Safe web handler candidate prioritization
"""
import pytest
from backend.services.career_github import extract_username_from_input
from backend.services.career_resume import parse_uploaded_resume_text
from backend.skills.handlers.web import handle_search_web
from unittest.mock import patch, AsyncMock


def test_extract_username_from_input_legitimate_sources():
    """Verify clean GitHub username extraction from URLs and handles."""
    assert extract_username_from_input("torvalds") == "torvalds"
    assert extract_username_from_input("@torvalds") == "torvalds"
    assert extract_username_from_input("https://github.com/torvalds") == "torvalds"
    assert extract_username_from_input("http://github.com/torvalds") == "torvalds"
    assert extract_username_from_input("github.com/torvalds") == "torvalds"
    assert extract_username_from_input("https://github.com/torvalds/linux") == "torvalds"
    assert extract_username_from_input("https://github.com/torvalds/linux/tree/master") == "torvalds"


def test_extract_username_from_input_malicious_urls():
    """Verify malicious or spoofed URLs cannot trick username extraction."""
    # Substring contains github.com/ but host is attacker.com
    malicious = "https://attacker.com/github.com/victim"
    result = extract_username_from_input(malicious)
    # Must NOT extract "victim"
    assert result != "victim"


def test_resume_parser_social_links_security():
    """Verify resume link extraction strictly validates hostnames."""
    resume_text = """
    Jane Doe
    jane@example.com | San Francisco, CA
    https://github.com/janedoe | https://www.linkedin.com/in/janedoe
    https://evil.com/fake/github.com/attacker

    SKILLS
    Python, TypeScript
    """
    res = parse_uploaded_resume_text(resume_text)
    assert res.github_or_portfolio == "https://github.com/janedoe"
    assert res.linkedin_url == "https://www.linkedin.com/in/janedoe"


@pytest.mark.asyncio
async def test_web_handler_candidate_prioritization_security():
    """Verify web handler securely selects official devpost or rules links."""
    mock_results = {
        "results": [
            {
                "title": "Malicious Spoof",
                "url": "https://attacker.com/devpost.com/phishing",
                "content": "Fake deadline due November 1, 2026",
                "score": 0.80,
            },
            {
                "title": "Official Devpost Portal",
                "url": "https://compass-hackathon.devpost.com/rules",
                "content": "Official deadline due October 30, 2026",
                "score": 0.95,
            },
        ]
    }

    with patch("backend.services.tavily.tavily_available", return_value=True), \
         patch("backend.services.tavily.search", AsyncMock(return_value=mock_results)):

        res = await handle_search_web({"query": "Hackathon deadline"}, None)
        assert res["success"] is True
        # Verified finding must be the authentic Devpost rules candidate
        assert "compass-hackathon.devpost.com/rules" in res["response"]
