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
    # Official First-Party / Organizer Platforms
    "nebius.com",
    "docs.nebius.com",
    "nvidia.com",
    "developer.nvidia.com",
    "arxiv.org",
}

_TIER_2_DOMAINS = {
    # Platform & User-Generated Content Hosts (max Tier 2 per specification)
    "devpost.com",
    "github.com",
    "github.io",
    "raw.githubusercontent.com",
    "gitlab.com",
    "huggingface.co",
    "pypi.org",
    "npmjs.com",
    "crates.io",
    "pkg.go.dev",
    "notion.site",
    "medium.com",
    "substack.com",
    "stackoverflow.com",
    "stackexchange.com",
    "wikipedia.org",
    "nature.com",
    "ieee.org",
    "acm.org",
    "theverge.com",
    "techcrunch.com",
    "venturebeat.com",
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


def classify_domain_authority(
    url: str,
    organizer_domains: Optional[set[str]] = None,
    target_entity: Optional[str] = None,
    is_entity_bound: bool = False,
    page_title_matches_entity: bool = False,
) -> Dict[str, Any]:
    """Classify the source authority of a URL.

    Rules:
      - Tier 1: Government/academic domains, pinned organizer domains from config, or platform event pages meeting the Event-Page Rule.
      - Event-Page Rule: Platform-hosted pages (Devpost, Lablab, etc.) count as official (Tier 1) for that event ONLY when
        the page title/organizer matches target_entity AND the URL is pinned or entity-bound; otherwise Tier 2.
      - Tier 2: General platform and user-generated content hosts (github, medium, unpinned devpost, etc.).
      - Tier 3: General web pages.
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

    from backend.config import get_settings
    settings = get_settings()
    configured_tier_1 = set(getattr(settings, "PINNED_TIER_1_DOMAINS", []))
    if organizer_domains:
        configured_tier_1.update(od.strip().lower() for od in organizer_domains if od)

    # Check explicitly pinned organizer domains from config
    for od in configured_tier_1:
        if domain == od or domain.endswith("." + od):
            return {
                "tier": AuthorityTier.TIER_1_OFFICIAL.value,
                "badge": "Official Organizer",
                "weight": 1.0,
                "domain": domain,
                "reason": f"Matched pinned organizer domain ({od})",
            }

    # Event-Page Rule for Platform-Hosted Pages
    platform_hosts = {"devpost.com", "lablab.ai", "dorahacks.io", "kaggle.com"}
    is_platform = any(domain == p or domain.endswith("." + p) for p in platform_hosts)
    if is_platform:
        # Check if URL itself or subdomain contains target entity
        clean_target = (target_entity or "").strip().lower()
        url_contains_entity = bool(clean_target and clean_target in url.lower())
        entity_qualifies = is_entity_bound or (url_contains_entity and page_title_matches_entity)

        if entity_qualifies and clean_target:
            return {
                "tier": AuthorityTier.TIER_1_OFFICIAL.value,
                "badge": "Official Event Page (Platform)",
                "weight": 0.95,
                "domain": domain,
                "reason": f"Platform-hosted official event page bound to '{clean_target}'",
            }
        else:
            return {
                "tier": AuthorityTier.TIER_2_TECHNICAL.value,
                "badge": "Platform / Community Host",
                "weight": 0.75,
                "domain": domain,
                "reason": f"Platform host ({domain}) without official entity binding (Tier 2)",
            }

    # Check Tier 1 primary official domains
    for t1 in _TIER_1_DOMAINS:
        if domain == t1 or domain.endswith("." + t1):
            return {
                "tier": AuthorityTier.TIER_1_OFFICIAL.value,
                "badge": "Official Organizer",
                "weight": 1.0,
                "domain": domain,
                "reason": f"Recognized primary authority ({t1})",
            }

    # Check Tier 2 platform & community hosts (max Tier 2)
    for t2 in _TIER_2_DOMAINS:
        if domain == t2 or domain.endswith("." + t2):
            return {
                "tier": AuthorityTier.TIER_2_TECHNICAL.value,
                "badge": "Platform / Community Host",
                "weight": 0.75,
                "domain": domain,
                "reason": f"Platform or community host ({t2})",
            }

    # Default to Tier 3 general web
    return {
        "tier": AuthorityTier.TIER_3_GENERAL.value,
        "badge": "General Web",
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
