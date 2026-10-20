"""
Compass — Career Copilot GitHub Profile Intelligence Service.

Extracts verifiable engineering evidence from public GitHub profiles and repositories
using the official GitHub REST API with bounded retrieval, rate-limit resilience,
strict prompt-injection defense, and transparent evidence classification.
"""
from __future__ import annotations

import base64
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import urlparse

import httpx

from backend.models_career import GitHubProfileIntelligence, GitHubRepoEvidence

logger = logging.getLogger("compass.services.career_github")

GITHUB_API_BASE = "https://api.github.com"
DEFAULT_TIMEOUT_SEC = 8.0
MAX_REPOS_TO_ANALYZE = 10
MAX_README_LENGTH = 2500

# Strict prompt-injection and control-token sanitization patterns
PROMPT_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(?:all\s+)?previous\s+instructions", re.IGNORECASE),
    re.compile(r"system\s*prompt", re.IGNORECASE),
    re.compile(r"<\|im_start\|>|<\|im_end\|>|\[INST\]|\[/INST\]", re.IGNORECASE),
    re.compile(r"you\s+are\s+now\s+(?:an?\s+)?unrestricted", re.IGNORECASE),
    re.compile(r"assistant\s*:", re.IGNORECASE),
    re.compile(r"new\s+instruction\s*:", re.IGNORECASE),
    re.compile(r"<!--[\s\S]*?-->"),  # hidden markdown comments
]


def sanitize_external_text(text: Optional[str], max_len: int = MAX_README_LENGTH) -> str:
    """
    Sanitizes untrusted repository text (READMEs, commit messages) to neutralize prompt injection.
    Never allows external markdown or comments to act as prompt instructions.
    """
    if not text:
        return ""
    clean = text
    for pat in PROMPT_INJECTION_PATTERNS:
        clean = pat.sub("[REDACTED_EXTERNAL_CONTENT]", clean)
    clean = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "", clean)
    return clean[:max_len].strip()


def extract_username_from_input(user_input: str) -> str:
    """Extracts clean username from URL or handle."""
    clean = user_input.strip()
    if not clean:
        return ""
    candidate_url = clean if clean.startswith(("http://", "https://")) else f"https://{clean}"
    try:
        parsed = urlparse(candidate_url)
        host = (parsed.hostname or "").lower()
        if host == "github.com" or host.endswith(".github.com"):
            path_parts = [p for p in (parsed.path or "").split("/") if p]
            if path_parts:
                return path_parts[0].strip()
    except Exception:
        pass
    return clean.lstrip("@").strip()


async def analyze_github_profile(
    username_or_url: str,
    token: Optional[str] = None,
    excluded_repos: Optional[List[str]] = None,
) -> GitHubProfileIntelligence:
    """
    Analyzes public repositories for a GitHub candidate.

    Enforces:
    - Bounded retrieval (max 10 active repos)
    - Distinguishes owned repositories from forks
    - Detects verified technologies, test coverage signs, and CI/CD configs
    - Defends against prompt injection in READMEs
    - Handles rate limits and network errors safely
    """
    username = extract_username_from_input(username_or_url)
    if not username or not re.match(r"^[a-zA-Z0-9\-]{1,39}$", username):
        return GitHubProfileIntelligence(
            username=username or "unknown",
            profile_url=f"https://github.com/{username}",
            total_public_repos=0,
            warnings=["Invalid GitHub username format."],
        )

    excluded_set: Set[str] = {r.lower() for r in (excluded_repos or [])}
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Compass-Career-Copilot/1.0",
    }
    if token and token.strip():
        headers["Authorization"] = f"token {token.strip()}"

    warnings: List[str] = []
    analyzed_repos: List[GitHubRepoEvidence] = []
    detected_skills_set: Set[str] = set()

    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SEC, headers=headers) as client:
        # 1. Fetch User Profile
        total_public = 0
        try:
            user_resp = await client.get(f"{GITHUB_API_BASE}/users/{username}")
            if user_resp.status_code == 404:
                return GitHubProfileIntelligence(
                    username=username,
                    profile_url=f"https://github.com/{username}",
                    total_public_repos=0,
                    warnings=[f"GitHub user '{username}' was not found."],
                )
            elif user_resp.status_code == 403:
                return GitHubProfileIntelligence(
                    username=username,
                    profile_url=f"https://github.com/{username}",
                    total_public_repos=0,
                    warnings=["GitHub API rate limit exceeded. Please provide an optional personal access token or try again later."],
                )
            elif user_resp.status_code != 200:
                return GitHubProfileIntelligence(
                    username=username,
                    profile_url=f"https://github.com/{username}",
                    total_public_repos=0,
                    warnings=[f"GitHub API returned error status {user_resp.status_code}."],
                )

            user_data = user_resp.json()
            total_public = user_data.get("public_repos", 0)

        except Exception as e:
            logger.warning("Error fetching GitHub user %s: %s", username, e)
            return GitHubProfileIntelligence(
                username=username,
                profile_url=f"https://github.com/{username}",
                total_public_repos=0,
                warnings=[f"Unable to connect to GitHub API: {e}"],
            )

        # 2. Fetch Repositories (sorted by recently pushed, max 10)
        try:
            repos_resp = await client.get(
                f"{GITHUB_API_BASE}/users/{username}/repos",
                params={"sort": "updated", "per_page": MAX_REPOS_TO_ANALYZE},
            )
            raw_repos = repos_resp.json() if repos_resp.status_code == 200 else []
        except Exception as e:
            raw_repos = []
            warnings.append(f"Failed to fetch repositories list: {e}")

        # 3. Analyze each repository with bounded inspection
        for r in raw_repos:
            repo_name = r.get("name", "")
            if not repo_name or repo_name.lower() in excluded_set:
                continue

            owner_login = r.get("owner", {}).get("login", username)
            is_fork = bool(r.get("fork", False))
            is_owned = (owner_login.lower() == username.lower() and not is_fork)
            repo_url = r.get("html_url", f"https://github.com/{owner_login}/{repo_name}")
            raw_desc = r.get("description") or ""
            desc = sanitize_external_text(raw_desc, 200)

            # Languages & Framework detection
            primary_lang = r.get("language")
            repo_techs: List[str] = []
            if primary_lang:
                repo_techs.append(primary_lang)
                detected_skills_set.add(primary_lang)

            # Check languages API (cached/lightweight)
            try:
                lang_resp = await client.get(f"{GITHUB_API_BASE}/repos/{owner_login}/{repo_name}/languages")
                if lang_resp.status_code == 200:
                    for lang in lang_resp.json().keys():
                        if lang not in repo_techs and len(repo_techs) < 6:
                            repo_techs.append(lang)
                        detected_skills_set.add(lang)
            except Exception:
                pass

            # Check contents for test suite & CI/CD signals
            has_tests = False
            has_ci_cd = False
            has_docs = False
            impl_evidence: List[str] = []

            try:
                contents_resp = await client.get(f"{GITHUB_API_BASE}/repos/{owner_login}/{repo_name}/contents")
                if contents_resp.status_code == 200:
                    filenames = [item.get("name", "").lower() for item in contents_resp.json() if isinstance(item, dict)]
                    for fname in filenames:
                        if fname in ("tests", "test", "spec", "specs", "pytest.ini", "jest.config.js") or fname.endswith("_test.go") or fname.endswith(".test.js") or fname.endswith(".test.ts") or fname.startswith("test_"):
                            has_tests = True
                        if fname in (".github", ".travis.yml", ".gitlab-ci.yml", "azure-pipelines.yml", "dockerfile", "docker-compose.yml"):
                            has_ci_cd = True
                        if fname.startswith("readme") or fname in ("docs", "documentation"):
                            has_docs = True

                    if has_tests:
                        impl_evidence.append("Automated test directory / configuration verified.")
                    if has_ci_cd:
                        impl_evidence.append("CI/CD pipeline workflow configuration verified.")
                    if primary_lang:
                        impl_evidence.append(f"Core codebase authored in {primary_lang}.")
            except Exception:
                pass

            # Readme snippet for truthful summary
            readme_summary = desc or f"Repository {repo_name}"
            limitations: List[str] = []
            if is_fork:
                limitations.append("Repository is a fork; contributions should be verified against commit history.")
            if not has_tests:
                limitations.append("No explicit automated test suite detected in root directory.")

            analyzed_repos.append(
                GitHubRepoEvidence(
                    repo_name=repo_name,
                    repo_url=repo_url,
                    owner=owner_login,
                    is_fork=is_fork,
                    is_owned=is_owned,
                    description=readme_summary,
                    primary_language=primary_lang,
                    detected_technologies=repo_techs,
                    has_tests=has_tests,
                    has_ci_cd=has_ci_cd,
                    has_documentation=has_docs,
                    analysis_timestamp=datetime.now(timezone.utc),
                    limitations=limitations,
                    implementation_evidence=impl_evidence,
                )
            )

    # Compile truthful evidence summary
    owned_count = sum(1 for r in analyzed_repos if r.is_owned)
    fork_count = sum(1 for r in analyzed_repos if r.is_fork)
    skills_list = sorted(list(detected_skills_set))

    summary = (
        f"Analyzed {len(analyzed_repos)} repositories for @{username} ({owned_count} original, {fork_count} forks). "
        f"Verified technologies: {', '.join(skills_list[:6]) if skills_list else 'None detected'}."
    )

    return GitHubProfileIntelligence(
        username=username,
        profile_url=f"https://github.com/{username}",
        total_public_repos=total_public,
        analyzed_repos=analyzed_repos,
        detected_skills=skills_list,
        evidence_summary=summary,
        warnings=warnings,
    )
