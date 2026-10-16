"""
Compass — Internship Radar Recruitment Cycle Prediction Engine.

Uses historical cycle records to estimate upcoming recruitment application windows
with explicit confidence scoring (High / Medium / Low / Unknown) and evidence provenance.

Rules:
1. Predictions are only produced when actual historical cycle records exist.
2. Predictions explicitly state they are historical estimates, not guaranteed confirmed deadlines.
3. Transparent median-based date windows are calculated.
"""
from __future__ import annotations

import statistics
from datetime import date
from typing import List, Optional
from backend.models_radar import (
    ConfidenceLevel,
    OpportunityCycleOut,
    OpportunityPredictionOut,
)

MONTH_NAMES = [
    "",
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
]


def estimate_recruitment_cycle(
    cycles: List[OpportunityCycleOut]
) -> OpportunityPredictionOut:
    """
    Computes statistical recruitment window estimation and confidence from historical cycles.
    """
    if not cycles:
        return OpportunityPredictionOut(
            estimated_open_window=None,
            estimated_open_month=None,
            confidence=ConfidenceLevel.UNKNOWN,
            evidence_basis="No reliable opening-window estimate is available yet. Compass will monitor official sources.",
            verified_cycles_count=0,
            last_observed_cycle=None,
        )

    # Filter cycles with observed open dates
    valid_cycles = [c for c in cycles if c.observed_open_date is not None]
    if not valid_cycles:
        return OpportunityPredictionOut(
            estimated_open_window=None,
            estimated_open_month=None,
            confidence=ConfidenceLevel.UNKNOWN,
            evidence_basis="Historical cycles recorded without exact opening calendar dates.",
            verified_cycles_count=len(cycles),
            last_observed_cycle=max([c.cycle_year for c in cycles], default=None),
        )

    # Sort chronologically by cycle year
    valid_cycles.sort(key=lambda c: c.cycle_year)
    verified_count = len(valid_cycles)
    last_cycle = valid_cycles[-1]

    # Convert open dates to day-of-year (1..365) to compute median window
    days_of_year = [c.observed_open_date.timetuple().tm_yday for c in valid_cycles]  # type: ignore[union-attr]
    median_doy = int(statistics.median(days_of_year))

    # Approximate month and window
    # Convert DOY to month (using 2024 as non-leap baseline approx)
    approx_date = date.fromordinal(date(2024, 1, 1).toordinal() + median_doy - 1)
    median_month_num = approx_date.month
    median_month_name = MONTH_NAMES[median_month_num]

    # Determine window (e.g. Early Month, or Month A - Month B)
    if approx_date.day <= 10:
        window_label = f"Early {median_month_name}"
    elif approx_date.day >= 20:
        next_month = (median_month_num % 12) + 1
        window_label = f"{median_month_name}–{MONTH_NAMES[next_month]}"
    else:
        prev_month = (median_month_num - 2) % 12 + 1
        window_label = f"{median_month_name} (Mid-month)"

    # Compute spread / consistency
    spread = max(days_of_year) - min(days_of_year) if len(days_of_year) > 1 else 0

    if verified_count >= 3 and spread <= 35:
        confidence = ConfidenceLevel.HIGH
        explanation = (
            f"Historically expected around {window_label}. "
            f"Evidence: {verified_count} consistent, independently verified recruitment cycles. "
            f"Last historical observation: {MONTH_NAMES[last_cycle.observed_open_date.month]} {last_cycle.cycle_year}."  # type: ignore[union-attr]
        )
    elif verified_count >= 2 and spread <= 60:
        confidence = ConfidenceLevel.MEDIUM
        explanation = (
            f"Historically estimated around {window_label}. "
            f"Based on {verified_count} previous recruitment cycles with slight variation across years. "
            f"Last cycle recorded in {last_cycle.cycle_year}."
        )
    elif verified_count >= 1:
        confidence = ConfidenceLevel.LOW
        explanation = (
            f"Single-cycle observation ({last_cycle.cycle_year}) indicates opening around {window_label}. "
            f"Confidence is low until subsequent cycles confirm pattern."
        )
    else:
        confidence = ConfidenceLevel.UNKNOWN
        explanation = "Insufficient verified cycle data."

    return OpportunityPredictionOut(
        estimated_open_window=window_label,
        estimated_open_month=median_month_name,
        confidence=confidence,
        evidence_basis=explanation,
        verified_cycles_count=verified_count,
        last_observed_cycle=last_cycle.cycle_year,
    )
