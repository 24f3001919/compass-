"""
Compass — Tavily Domain Authority and Source Quality Classifier.

Distinguishes official documentation, academic/government sources, reputable technical
publications, and general web pages to prevent low-confidence sources from overwhelming
verified primary evidence.
"""

from __future__ import annotations

import enum
import re
import urllib.parse
from typing import Any, Dict, List, Optional


class AuthorityTier(str, enum.Enum):
    TIER_1_OFFICIAL = "tier_1_official"
    TIER_2_TECHNICAL = "tier_2_technical"
    TIER_3_GENERAL = "tier_3_general"


_TIER_1_DOMAINS = {
    # Official Platforms & Repositories
    "github.com",
    "raw.githubusercontent.com",
    "gitlab.com",
    "huggingface.co",
    "pypi.org",
    "npmjs.com",
    "crates.io",
    "pkg.go.dev",
    # Official Hackathon / Model Platforms
    "nebius.com",
    "docs.nebius.com",
    "nvidia.com",
    "developer.nvidia.com",
    "devpost.com",
    "arxiv.org",
}

_TIER_2_DOMAINS = {
    # Reputable Tech & Knowledge Platforms
    "stackoverflow.com",
    "stackexchange.com",
    "wikipedia.org",
    "nature.com",
    "ieee.org",
    "acm.org",
    "theverge.com",
    "techcrunch.com",
    "venturebeat.com",
    "medium.com",
    "substack.com",
    "towardsdatascience.com",
}

_OFFICIAL_PREFIXES = ("docs.", "api.", "developer.", "dev.", "help.", "support.", "learn.")


def extract_domain(url: str) -> str:
    """Extract clean domain from URL."""
    if not url:
        return ""
    try:
        parsed = urllib.parse.urlsplit(url.strip())
        domain = (parsed.hostname or "").lower()
        if domain.startswith("www."):
            domain = domain[4:]
        return domain
    except Exception:
        return ""


def classify_domain_authority(url: str) -> Dict[str, Any]:
    """Classify the source authority of a URL.

    Returns:
        tier: AuthorityTier enum string
        badge: Human-readable badge text
        weight: Float multiplier between 0.5 and 1.0
        reason: Explanation of classification
    """
    domain = extract_domain(url)
    if not domain:
        return {
            "tier": AuthorityTier.TIER_3_GENERAL.value,
            "badge": "General Web",
            "weight": 0.50,
            "domain": "unknown",
            "reason": "Missing or unparseable URL",
        }

    # Check Gov / Edu top-level domains
    if domain.endswith(".gov") or domain.endswith(".gov.uk") or domain.endswith(".gov.in"):
        return {
            "tier": AuthorityTier.TIER_1_OFFICIAL.value,
            "badge": "Official Gov",
            "weight": 1.0,
            "domain": domain,
            "reason": "Government domain",
        }
    if domain.endswith(".edu") or domain.endswith(".ac.uk"):
        return {
            "tier": AuthorityTier.TIER_1_OFFICIAL.value,
            "badge": "Academic (.edu)",
            "weight": 0.95,
            "domain": domain,
            "reason": "Accredited academic institution",
        }

    # Check Tier 1 exact or subdomain matches
    for t1 in _TIER_1_DOMAINS:
        if domain == t1 or domain.endswith("." + t1):
            return {
                "tier": AuthorityTier.TIER_1_OFFICIAL.value,
                "badge": "Official Docs / Repo",
                "weight": 1.0,
                "domain": domain,
                "reason": f"Recognized primary authority ({t1})",
            }

    # Check documentation subdomain prefixes (e.g., docs.python.org, developer.mozilla.org)
    for prefix in _OFFICIAL_PREFIXES:
        if domain.startswith(prefix):
            return {
                "tier": AuthorityTier.TIER_1_OFFICIAL.value,
                "badge": "Official Docs",
                "weight": 0.92,
                "domain": domain,
                "reason": f"Documentation subdomain prefix '{prefix}'",
            }

    # Check Tier 2 exact or subdomain matches
    for t2 in _TIER_2_DOMAINS:
        if domain == t2 or domain.endswith("." + t2):
            return {
                "tier": AuthorityTier.TIER_2_TECHNICAL.value,
                "badge": "Technical Publication",
                "weight": 0.75,
                "domain": domain,
                "reason": f"Reputable technical/reference domain ({t2})",
            }

    # Default to Tier 3 general web
    return {
        "tier": AuthorityTier.TIER_3_GENERAL.value,
        "badge": "Web Source",
        "weight": 0.50,
        "domain": domain,
        "reason": "General public web source",
    }


def compute_composite_score(tavily_score: float, authority_weight: float) -> float:
    """Calculate blended relevance + authority ranking score.

    Weighted 60% Tavily semantic relevance + 40% source domain authority.
    """
    safe_tavily = max(0.0, min(1.0, float(tavily_score or 0.5)))
    safe_auth = max(0.0, min(1.0, float(authority_weight or 0.5)))
    return round((safe_tavily * 0.60) + (safe_auth * 0.40), 4)


def sort_and_enrich_sources(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Enrich each search result with domain authority tier, badge, and composite score.

    Sorts highest composite score first.
    """
    enriched = []
    for r in results:
        url = r.get("url") or ""
        auth_meta = classify_domain_authority(url)
        tavily_score = float(r.get("score") or 0.5)
        composite = compute_composite_score(tavily_score, auth_meta["weight"])

        item = dict(r)
        item["authority_tier"] = auth_meta["tier"]
        item["authority_badge"] = auth_meta["badge"]
        item["authority_weight"] = auth_meta["weight"]
        item["domain"] = auth_meta["domain"]
        item["composite_score"] = composite
        enriched.append(item)

    # Sort descending by composite score, then by raw score
    enriched.sort(key=lambda x: (x.get("composite_score", 0.0), x.get("score", 0.0)), reverse=True)
    return enriched
