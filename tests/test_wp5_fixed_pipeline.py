import datetime
import pytest

from backend.router_helpers import should_route_to_query_tasks
from backend.services.tavily_pipeline import (
    parse_time_utc,
    check_domain_independence,
    make_cache_key,
    PARSER_VERSION,
)


def test_router_personal_scope_rule():
    nebius_q = "What is the deadline for the Nebius Global AI Hackathon?"
    tasks_q = "Show my hackathon tasks"
    assert not should_route_to_query_tasks(nebius_q), "Nebius question must NOT reach query_tasks"
    assert should_route_to_query_tasks(tasks_q), "Personal tasks question MUST reach query_tasks"


def test_captured_text_fixtures_and_utc_equivalence():
    src1 = "Submission Period: Wednesday, August 26, 2026 (9:00 am Pacific Time) – Friday, October 30, 2026 (10:00 am Pacific Time)"
    src2 = "October 30 at 1:00pm EDT to deadline"

    dt1, prov1 = parse_time_utc(src1)
    assert prov1 == "explicit_in_quote"
    assert dt1 is not None
    assert dt1.hour == 17 and dt1.minute == 0, f"Expected 17:00 UTC, got {dt1}"

    # Source 2 anchored to year 2026 from Source 1
    dt2, prov2 = parse_time_utc(src2, default_year=dt1.year)
    assert prov2 == "year_inferred"
    assert dt2 is not None
    assert dt2.hour == 17 and dt2.minute == 0, f"Expected 17:00 UTC, got {dt2}"

    assert dt1 == dt2, "Both sources must resolve to the EXACT SAME UTC instant (17:00 UTC)"


def test_platform_hosted_independence_check():
    url1 = "https://nebiusglobalaihackathon.devpost.com/rules"
    url2 = "https://nebiusglobalaihackathon.devpost.com/"
    independent = check_domain_independence(url1, url2)
    assert not independent, "Two devpost pages are NOT independent sources"
    verdict = "PARTIALLY_VERIFIED" if not independent else "VERIFIED"
    assert verdict == "PARTIALLY_VERIFIED"


def test_cache_key_busting():
    nebius_q = "What is the deadline for the Nebius Global AI Hackathon?"
    k1 = make_cache_key(nebius_q)
    assert PARSER_VERSION == "v2_anchor_aware"
    assert isinstance(k1, str) and len(k1) == 64
