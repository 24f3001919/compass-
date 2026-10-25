"""
Contract test verifying that all fields expected by the frontend RadarOverviewCards component
exist on the backend OpportunityOverviewStats model.
"""

import pytest
from backend.models_radar import OpportunityOverviewStats


def test_opportunity_overview_stats_has_verified_open_count():
    """Frontend component reads stats.verified_open_count; model must expose it."""
    stats = OpportunityOverviewStats()
    assert hasattr(stats, "verified_open_count")
    assert stats.verified_open_count == 0


def test_all_frontend_overview_card_keys_exist_in_schema():
    """Every key rendered by RadarOverviewCards.jsx must exist in OpportunityOverviewStats."""
    frontend_read_keys = [
        "verified_open_count",
        "strong_matches_count",
        "opening_soon_count",
        "upcoming_deadlines_count",
        "saved_count",
        "applications_in_progress_count",
        "total_tracked_opportunities",
        "startups_count",
        "research_count",
        "enterprise_count",
    ]
    stats = OpportunityOverviewStats(
        verified_open_count=15,
        strong_matches_count=5,
        opening_soon_count=2,
    )
    schema_fields = OpportunityOverviewStats.model_fields.keys()
    for key in frontend_read_keys:
        assert key in schema_fields, f"Frontend key '{key}' missing from OpportunityOverviewStats schema!"
