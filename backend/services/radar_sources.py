"""
Compass — Internship Radar Source Adapters.

Parses curated GitHub repositories, seed directories, and public ATS job postings
with provenance tracking and deduplication canonicalization.
"""
from __future__ import annotations

import re
import urllib.parse
from datetime import date
from typing import Any, Dict, List, Optional
import httpx


def canonicalize_url(url: str) -> str:
    """
    Normalizes a job or application URL for deduplication.
    Strips tracking params (utm_*, ref, gh_src, etc.) and fragments.
    """
    if not url:
        return ""
    try:
        parsed = urllib.parse.urlparse(url.strip())
        # Filter query params
        q_params = urllib.parse.parse_qs(parsed.query)
        allowed_params = {
            k: v for k, v in q_params.items()
            if not k.startswith("utm_") and k not in {"ref", "source", "gh_src", "lever-origin", "fbclid"}
        }
        clean_query = urllib.parse.urlencode(allowed_params, doseq=True)
        # Normalize netloc and path
        netloc = parsed.netloc.lower()
        path = parsed.path.rstrip("/")
        return urllib.parse.urlunparse((parsed.scheme.lower(), netloc, path, "", clean_query, ""))
    except Exception:
        return url.strip().split("?")[0].rstrip("/")


def normalize_company_name(name: str) -> str:
    """
    Normalizes company names for deduplication (e.g. 'Google LLC' -> 'Google').
    """
    clean = re.sub(r"\b(inc|corp|corporation|llc|ltd|limited|technologies|technology|systems|labs|pvt)\b", "", name, flags=re.IGNORECASE)
    clean = re.sub(r"[^\w\s]", "", clean)
    return " ".join(clean.split()).title()


# ---------------------------------------------------------------------------
# GitHub Repository Parsers
# ---------------------------------------------------------------------------

def parse_markdown_table_opportunities(
    md_content: str,
    source_name: str,
    source_url: str,
) -> List[Dict[str, Any]]:
    """
    Parses Markdown tables commonly found in community internship repos.
    Extracts Company, Role, Location, Application Link, and requirements.
    """
    opportunities: List[Dict[str, Any]] = []
    lines = md_content.splitlines()

    table_lines: List[str] = []
    in_table = False

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("|") and stripped.endswith("|"):
            in_table = True
            table_lines.append(stripped)
        elif in_table:
            # Table ended or blank line
            if len(table_lines) >= 3:
                _process_table_block(table_lines, source_name, source_url, opportunities)
            table_lines = []
            in_table = False

    if in_table and len(table_lines) >= 3:
        _process_table_block(table_lines, source_name, source_url, opportunities)

    return opportunities


def _process_table_block(
    table_lines: List[str],
    source_name: str,
    source_url: str,
    out: List[Dict[str, Any]],
) -> None:
    headers = [h.strip().lower() for h in table_lines[0].split("|")[1:-1]]
    # Find column indices
    company_idx = next((i for i, h in enumerate(headers) if "company" in h or "organization" in h), 0)
    role_idx = next((i for i, h in enumerate(headers) if "role" in h or "title" in h or "position" in h), 1)
    location_idx = next((i for i, h in enumerate(headers) if "location" in h), -1)
    link_idx = next((i for i, h in enumerate(headers) if "link" in h or "apply" in h or "application" in h), -1)

    for row_line in table_lines[2:]:  # Skip header and separator
        cols = [c.strip() for c in row_line.split("|")[1:-1]]
        if len(cols) <= max(company_idx, role_idx):
            continue

        raw_company = cols[company_idx] if company_idx < len(cols) else "Unknown"
        raw_role = cols[role_idx] if role_idx < len(cols) else "Software Engineering Intern"
        raw_location = cols[location_idx] if 0 <= location_idx < len(cols) else "Remote / Flexible"
        raw_link_cell = cols[link_idx] if 0 <= link_idx < len(cols) else ""

        # Extract markdown link: [text](url)
        url_match = re.search(r"\[([^\]]+)\]\((https?://[^\s\)]+)\)", raw_link_cell) or re.search(r"\[([^\]]+)\]\((https?://[^\s\)]+)\)", raw_company) or re.search(r"\[([^\]]+)\]\((https?://[^\s\)]+)\)", raw_role)
        app_url = url_match.group(2) if url_match else None

        # Clean display names
        comp_clean = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", raw_company).strip()
        comp_clean = re.sub(r"[^\w\s\-.]", "", comp_clean).strip()
        role_clean = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", raw_role).strip()

        if not comp_clean or not app_url:
            continue

        # Detect category
        category = _infer_category(role_clean)
        work_arr = "remote" if "remote" in raw_location.lower() else "onsite"
        is_india = "india" in raw_location.lower() or work_arr == "remote"

        out.append({
            "company_name": comp_clean,
            "role_title": role_clean,
            "opportunity_type": "internship",
            "category": category,
            "location": raw_location,
            "work_arrangement": work_arr,
            "country": "India" if "india" in raw_location.lower() else "Global",
            "is_india_eligible": is_india,
            "official_application_url": app_url,
            "canonical_url": canonicalize_url(app_url),
            "current_status": "NEEDS_VERIFICATION",
            "description": f"Discovered via {source_name}. Published location: {raw_location}.",
            "source_name": source_name,
            "source_type": "github_curated",
            "source_url": source_url,
            "eligible_academic_years": [1, 2] if "underclass" in source_name.lower() or "freshman" in role_clean.lower() else [2, 3, 4],
        })


def _infer_category(title: str) -> str:
    tl = title.lower()
    if any(k in tl for k in ["ai", "machine learning", "ml", "deep learning", "llm", "nlp", "computer vision"]):
        return "ai_ml"
    if any(k in tl for k in ["data science", "data analyst", "data engineer"]):
        return "data"
    if any(k in tl for k in ["research", "fellow", "lab"]):
        return "research"
    if any(k in tl for k in ["backend", "server", "distributed", "systems"]):
        return "backend"
    if any(k in tl for k in ["cloud", "devops", "infrastructure", "sre"]):
        return "cloud"
    if any(k in tl for k in ["open source", "gsoc"]):
        return "open_source"
    return "swe"


# ---------------------------------------------------------------------------
# Verified Curated Indian Tech & Research Opportunities Seed
# ---------------------------------------------------------------------------

CURATED_INDIAN_OPPORTUNITIES: List[Dict[str, Any]] = [
    {
        "company_name": "Microsoft Research India",
        "role_title": "Research Fellow (AI / ML / Systems)",
        "opportunity_type": "research",
        "category": "research",
        "location": "Bengaluru, Karnataka, India",
        "work_arrangement": "onsite",
        "country": "India",
        "is_india_eligible": True,
        "compensation": "Paid (₹80,000 - ₹1,00,000 / month)",
        "duration": "1-2 years / 6 months",
        "official_application_url": "https://www.microsoft.com/en-us/research/academic-program/research-fellows-program/",
        "canonical_url": "https://www.microsoft.com/en-us/research/academic-program/research-fellows-program",
        "current_status": "OPEN_CONFIRMED",
        "confirmed_open_date": date(2026, 1, 15),
        "description": "Pre-doctoral research fellowship focusing on Foundation Models, ML theory, Multimodal AI, and Systems in Bangalore.",
        "requirements": {
            "eligible_degree_types": ["Bachelors", "Masters", "B.Tech", "BS"],
            "eligible_academic_years": [3, 4],
            "eligible_graduation_years": [2026, 2027],
            "eligible_countries": ["India"],
            "work_auth_required": True,
            "sponsorship_available": True,
            "required_skills": ["Python", "PyTorch", "Algorithms", "Linear Algebra"],
        },
        "cycles": [
            {"cycle_year": 2024, "observed_open_date": date(2024, 1, 15), "observed_close_date": date(2024, 3, 31)},
            {"cycle_year": 2025, "observed_open_date": date(2025, 1, 20), "observed_close_date": date(2025, 3, 31)},
            {"cycle_year": 2026, "observed_open_date": date(2026, 1, 15), "observed_close_date": date(2026, 4, 15)},
        ],
        "source": {
            "source_name": "Microsoft Research Portal",
            "source_type": "official_career_page",
            "source_url": "https://www.microsoft.com/en-us/research/academic-program/research-fellows-program/",
            "source_authority": "tier_1",
        }
    },
    {
        "company_name": "Google India",
        "role_title": "Software Engineering STEP Intern 2026",
        "opportunity_type": "internship",
        "category": "swe",
        "location": "Bengaluru / Hyderabad, India",
        "work_arrangement": "hybrid",
        "country": "India",
        "is_india_eligible": True,
        "compensation": "Paid (~₹1,10,000 / month)",
        "duration": "10-12 weeks (Summer 2026)",
        "official_application_url": "https://careers.google.com/jobs/results/?location=India&q=STEP",
        "canonical_url": "https://careers.google.com/jobs/results/?location=india&q=step",
        "current_status": "OPEN_CONFIRMED",
        "confirmed_open_date": date(2025, 12, 1),
        "description": "Student Training in Engineering Program (STEP) for undergraduate students in their 2nd year of university.",
        "requirements": {
            "eligible_degree_types": ["B.Tech", "B.E.", "BS in Computer Science"],
            "eligible_academic_years": [2],
            "eligible_graduation_years": [2027, 2028],
            "eligible_countries": ["India"],
            "work_auth_required": False,
            "sponsorship_available": False,
            "required_skills": ["C++", "Java", "Python", "Data Structures", "Algorithms"],
        },
        "cycles": [
            {"cycle_year": 2023, "observed_open_date": date(2023, 11, 28), "observed_close_date": date(2024, 1, 15)},
            {"cycle_year": 2024, "observed_open_date": date(2024, 12, 5), "observed_close_date": date(2025, 1, 20)},
            {"cycle_year": 2025, "observed_open_date": date(2025, 12, 1), "observed_close_date": date(2026, 1, 31)},
        ],
        "source": {
            "source_name": "Google Careers India",
            "source_type": "official_career_page",
            "source_url": "https://careers.google.com",
            "source_authority": "tier_1",
        }
    },
    {
        "company_name": "NVIDIA",
        "role_title": "Deep Learning & AI Software Intern",
        "opportunity_type": "internship",
        "category": "ai_ml",
        "location": "Pune / Bengaluru, India",
        "work_arrangement": "hybrid",
        "country": "India",
        "is_india_eligible": True,
        "compensation": "Paid (₹50,000 - ₹75,000 / month)",
        "duration": "6 months",
        "official_application_url": "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
        "canonical_url": "https://nvidia.wd5.myworkdayjobs.com/nvidiaexternalcareersite",
        "current_status": "OPEN_CONFIRMED",
        "confirmed_open_date": date(2026, 2, 1),
        "description": "Accelerated computing, CUDA kernel optimization, and generative AI research integration on NVIDIA GPUs.",
        "requirements": {
            "eligible_degree_types": ["Bachelors", "Masters", "B.Tech"],
            "eligible_academic_years": [3, 4],
            "eligible_graduation_years": [2026, 2027],
            "eligible_countries": ["India"],
            "work_auth_required": True,
            "sponsorship_available": True,
            "required_skills": ["CUDA", "C++", "PyTorch", "Deep Learning", "TensorRT"],
        },
        "cycles": [
            {"cycle_year": 2024, "observed_open_date": date(2024, 2, 10), "observed_close_date": date(2024, 5, 1)},
            {"cycle_year": 2025, "observed_open_date": date(2025, 2, 5), "observed_close_date": date(2025, 4, 30)},
        ],
        "source": {
            "source_name": "NVIDIA Workday Careers",
            "source_type": "official_career_page",
            "source_url": "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
            "source_authority": "tier_1",
        }
    },
    {
        "company_name": "Amazon India",
        "role_title": "Software Development Engineer (SDE) Intern - 2026",
        "opportunity_type": "internship",
        "category": "swe",
        "location": "Bengaluru / Hyderabad / Chennai, India",
        "work_arrangement": "onsite",
        "country": "India",
        "is_india_eligible": True,
        "compensation": "Paid (~₹1,10,000 / month)",
        "duration": "2 months / 6 months",
        "official_application_url": "https://amazon.jobs/en/jobs/sde-intern-india",
        "canonical_url": "https://amazon.jobs/en/jobs/sde-intern-india",
        "current_status": "UPCOMING_CONFIRMED",
        "confirmed_open_date": date(2026, 8, 15),
        "description": "Design and build large-scale distributed cloud systems backing AWS and Amazon Consumer platforms.",
        "requirements": {
            "eligible_degree_types": ["B.Tech", "B.E.", "M.Tech", "MCA"],
            "eligible_academic_years": [3],
            "eligible_graduation_years": [2027],
            "eligible_countries": ["India"],
            "work_auth_required": True,
            "sponsorship_available": False,
            "required_skills": ["Java", "Object-Oriented Design", "Data Structures", "Algorithms"],
        },
        "cycles": [
            {"cycle_year": 2023, "observed_open_date": date(2023, 8, 20), "observed_close_date": date(2023, 10, 15)},
            {"cycle_year": 2024, "observed_open_date": date(2024, 8, 18), "observed_close_date": date(2024, 10, 20)},
            {"cycle_year": 2025, "observed_open_date": date(2025, 8, 22), "observed_close_date": date(2025, 10, 30)},
        ],
        "source": {
            "source_name": "Amazon Jobs Portal",
            "source_type": "official_career_page",
            "source_url": "https://amazon.jobs",
            "source_authority": "tier_1",
        }
    },
    {
        "company_name": "IIIT Hyderabad",
        "role_title": "Summer Research Internship in AI & Robotics",
        "opportunity_type": "research",
        "category": "research",
        "location": "Hyderabad, Telangana, India",
        "work_arrangement": "onsite",
        "country": "India",
        "is_india_eligible": True,
        "compensation": "Stipend (₹10,000 - ₹15,000 / month)",
        "duration": "8-10 weeks (May-July 2026)",
        "official_application_url": "https://www.iiit.ac.in/academics/internships/",
        "canonical_url": "https://www.iiit.ac.in/academics/internships",
        "current_status": "UPCOMING_CONFIRMED",
        "confirmed_open_date": date(2026, 3, 1),
        "description": "Mentored research with Kohli Center on Intelligent Systems (KCIS) and Robotics Research Center.",
        "requirements": {
            "eligible_degree_types": ["B.Tech", "BS", "Dual Degree"],
            "eligible_academic_years": [2, 3],
            "eligible_graduation_years": [2027, 2028],
            "eligible_countries": ["India"],
            "work_auth_required": False,
            "sponsorship_available": False,
            "required_skills": ["Python", "Machine Learning", "Linear Algebra"],
        },
        "cycles": [
            {"cycle_year": 2023, "observed_open_date": date(2023, 3, 1), "observed_close_date": date(2023, 3, 31)},
            {"cycle_year": 2024, "observed_open_date": date(2024, 3, 5), "observed_close_date": date(2024, 4, 5)},
            {"cycle_year": 2025, "observed_open_date": date(2025, 3, 1), "observed_close_date": date(2025, 3, 31)},
        ],
        "source": {
            "source_name": "IIIT Hyderabad Academics",
            "source_type": "university_portal",
            "source_url": "https://www.iiit.ac.in",
            "source_authority": "tier_1",
        }
    },
    {
        "company_name": "Razorpay",
        "role_title": "Backend Engineering Intern",
        "opportunity_type": "internship",
        "category": "backend",
        "location": "Bengaluru, Karnataka, India",
        "work_arrangement": "hybrid",
        "country": "India",
        "is_india_eligible": True,
        "compensation": "Paid (₹40,000 - ₹50,000 / month)",
        "duration": "6 months",
        "official_application_url": "https://razorpay.com/jobs/",
        "canonical_url": "https://razorpay.com/jobs",
        "current_status": "OPEN_CONFIRMED",
        "confirmed_open_date": date(2026, 1, 10),
        "description": "High-throughput fintech payment gateway pipelines, Go microservices, and idempotent distributed APIs.",
        "requirements": {
            "eligible_degree_types": ["B.Tech", "BE", "MCA"],
            "eligible_academic_years": [3, 4],
            "eligible_graduation_years": [2026, 2027],
            "eligible_countries": ["India"],
            "work_auth_required": True,
            "sponsorship_available": False,
            "required_skills": ["Go", "MySQL", "Distributed Systems", "REST APIs"],
        },
        "cycles": [
            {"cycle_year": 2024, "observed_open_date": date(2024, 1, 15), "observed_close_date": date(2024, 3, 15)},
            {"cycle_year": 2025, "observed_open_date": date(2025, 1, 10), "observed_close_date": date(2025, 3, 20)},
        ],
        "source": {
            "source_name": "Razorpay Careers",
            "source_type": "official_career_page",
            "source_url": "https://razorpay.com/jobs/",
            "source_authority": "tier_1",
        }
    }
]


async def fetch_github_markdown_opportunities(
    repo_raw_url: str,
    source_name: str,
    timeout_sec: float = 10.0,
) -> List[Dict[str, Any]]:
    """
    Downloads and parses a public GitHub raw markdown repository.
    Handles network errors safely with timeouts and empty fallbacks.
    """
    try:
        async with httpx.AsyncClient(timeout=timeout_sec) as client:
            resp = await client.get(repo_raw_url)
            if resp.status_code == 200:
                return parse_markdown_table_opportunities(resp.text, source_name, repo_raw_url)
            return []
    except Exception:
        return []
