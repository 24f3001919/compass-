"""
Synthetic test fixtures and factory for JobSpy integration testing.

CRITICAL ARCHITECTURAL BOUNDARY:
All fixtures, companies (e.g. SyntheticQuantumCorp, SyntheticSystemsLabs),
job IDs (syn-*), and example URLs in this file are STRICTLY for deterministic
unit and integration testing. They must NEVER be imported or used in production
code, runtime services, or database seed scripts.
"""

from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
import pandas as pd


# Synthetic identifier prefixes used for regression checks
SYNTHETIC_TEST_MARKERS = [
    "SyntheticQuantumCorp",
    "SyntheticSystemsLabs",
    "SyntheticCloudInfra",
    "SyntheticMegaCorp",
    "SyntheticFutureLabs",
    "syn-1",
    "syn-2",
    "syn-3",
    "syn-4",
    "syn-future",
]


def create_synthetic_jobspy_rows(
    base_time: Optional[datetime] = None,
    include_future_date: bool = False,
    include_invalid_date: bool = False,
) -> List[Dict[str, Any]]:
    """
    Factory function producing deterministic synthetic job board rows.
    
    Accepts an injected test clock `base_time` (defaults to current UTC)
    to ensure full reproducibility without depending on live network or job boards.

    Covers:
      1. Verified within 24h internship (exact UTC timestamp)
      2. Duplicate of verified listing (same company, title, url)
      3. Date-only approximate recency internship (date object)
      4. Missing timestamp / unknown recency (None)
      5. Non-internship senior role (filtered by internship keyword logic)
      6. (Optional) Future timestamp
      7. (Optional) Invalid/unparseable timestamp
    """
    if base_time is None:
        base_time = datetime.now(timezone.utc)
    elif base_time.tzinfo is None:
        base_time = base_time.replace(tzinfo=timezone.utc)

    rows: List[Dict[str, Any]] = [
        # 1. Valid verified within 24h internship
        {
            "id": "syn-1",
            "title": "Quantum ML Research Intern",
            "company": "SyntheticQuantumCorp",
            "job_url": "https://quantum-corp.example/intern-2026",
            "location": "Remote, India",
            "date_posted": base_time - timedelta(hours=4),
            "description": "Looking for undergraduate intern in quantum algorithms.",
            "site": "indeed",
            "is_remote": True,
        },
        # 2. Duplicate of syn-1
        {
            "id": "syn-1-dup",
            "title": "Quantum ML Research Intern",
            "company": "SyntheticQuantumCorp",
            "job_url": "https://quantum-corp.example/intern-2026",
            "location": "Remote, India",
            "date_posted": base_time - timedelta(hours=4),
            "description": "Duplicate listing.",
            "site": "indeed",
            "is_remote": True,
        },
        # 3. Date-only approximate recency internship
        {
            "id": "syn-2",
            "title": "Systems Engineering Intern",
            "company": "SyntheticSystemsLabs",
            "job_url": "https://systems-labs.example/internship",
            "location": "Bengaluru, India",
            "date_posted": base_time.date(),
            "description": "Distributed systems co-op intern position.",
            "site": "indeed",
            "is_remote": False,
        },
        # 4. Unknown recency internship (missing date)
        {
            "id": "syn-3",
            "title": "Cloud Infrastructure Intern",
            "company": "SyntheticCloudInfra",
            "job_url": "https://cloud-infra.example/apply",
            "location": "Remote",
            "date_posted": None,
            "description": "Kubernetes and Linux kernel intern.",
            "site": "indeed",
            "is_remote": True,
        },
        # 5. Non-internship senior role (should be filtered)
        {
            "id": "syn-4",
            "title": "VP of Global Cloud Sales",
            "company": "SyntheticMegaCorp",
            "job_url": "https://megacorp.example/sales",
            "location": "New York",
            "date_posted": base_time - timedelta(hours=1),
            "description": "Requires 20 years leadership experience.",
            "site": "indeed",
            "is_remote": False,
        },
    ]

    if include_future_date:
        rows.append({
            "id": "syn-future",
            "title": "Future Systems Research Intern",
            "company": "SyntheticFutureLabs",
            "job_url": "https://future-labs.example/intern-2030",
            "location": "Remote",
            "date_posted": base_time + timedelta(days=2),
            "description": "Post-quantum cryptography research intern.",
            "site": "indeed",
            "is_remote": True,
        })

    if include_invalid_date:
        rows.append({
            "id": "syn-invalid-date",
            "title": "Hardware Validation Intern",
            "company": "SyntheticFutureLabs",
            "job_url": "https://future-labs.example/hardware-intern",
            "location": "Remote",
            "date_posted": "not-a-valid-date-format",
            "description": "FPGA verification and testing intern.",
            "site": "indeed",
            "is_remote": True,
        })

    return rows


def create_synthetic_jobspy_dataframe(
    base_time: Optional[datetime] = None,
    include_future_date: bool = False,
    include_invalid_date: bool = False,
) -> pd.DataFrame:
    """Helper to return synthetic rows wrapped in a pandas DataFrame, matching JobSpy's return type."""
    rows = create_synthetic_jobspy_rows(
        base_time=base_time,
        include_future_date=include_future_date,
        include_invalid_date=include_invalid_date,
    )
    return pd.DataFrame(rows)
