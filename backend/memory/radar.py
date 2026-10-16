"""
Compass — Internship Radar Database Access Layer.

Handles storage, retrieval, filtering, deduplication, historical cycle tracking,
user application tracking, and sync run telemetry for opportunities.
Supports asyncpg connection pooling with graceful in-memory fallbacks when DB pool is offline.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import asyncpg

from backend.memory.db import get_pool as _raw_get_pool
from backend.models_radar import (
    ApplicationStatus,
    OpportunityCycleOut,
    OpportunityOut,
    OpportunityRequirementsOut,
    OpportunitySourceOut,
    OpportunityStatus,
    UserOpportunityProfileIn,
)

logger = logging.getLogger("compass.memory.radar")

# In-memory storage fallback for offline / test environments
_in_memory_opportunities: Dict[int, Dict[str, Any]] = {}
_in_memory_user_profiles: Dict[str, Dict[str, Any]] = {}
_in_memory_user_opps: Dict[str, Dict[str, Any]] = {}
_in_memory_sync_runs: List[Dict[str, Any]] = []
_id_seq = 1000

_db_pool_available: bool = True

async def get_pool() -> Optional[asyncpg.Pool]:
    """Return database pool, quickly switching to in-memory fallback if unavailable."""
    global _db_pool_available
    if not _db_pool_available:
        return None
    try:
        pool = await asyncio.wait_for(_raw_get_pool(), timeout=1.5)
        return pool
    except Exception as e:
        _db_pool_available = False
        logger.info(f"Database connection pool unavailable ({e}); using radar in-memory storage mode.")
        return None


def _parse_row_to_opportunity(row: Dict[str, Any], sources: List[Dict[str, Any]], cycles: List[Dict[str, Any]]) -> OpportunityOut:
    reqs = None
    if row.get("requirements"):
        req_data = row["requirements"]
        reqs = OpportunityRequirementsOut(
            eligible_degree_types=req_data.get("eligible_degree_types") or [],
            eligible_academic_years=req_data.get("eligible_academic_years") or [],
            eligible_graduation_years=req_data.get("eligible_graduation_years") or [],
            eligible_countries=req_data.get("eligible_countries") or [],
            work_auth_required=req_data.get("work_auth_required"),
            sponsorship_available=req_data.get("sponsorship_available"),
            required_skills=req_data.get("required_skills") or [],
            min_gpa=req_data.get("min_gpa"),
            other_mandatory_requirements=req_data.get("other_mandatory_requirements"),
            unknown_requirements=req_data.get("unknown_requirements") or [],
        )
    elif row.get("eligible_academic_years") is not None or row.get("eligible_degree_types") is not None:
        reqs = OpportunityRequirementsOut(
            eligible_degree_types=row.get("eligible_degree_types") or [],
            eligible_academic_years=row.get("eligible_academic_years") or [],
            eligible_graduation_years=row.get("eligible_graduation_years") or [],
            eligible_countries=row.get("eligible_countries") or [],
            work_auth_required=row.get("work_auth_required"),
            sponsorship_available=row.get("sponsorship_available"),
            required_skills=row.get("required_skills") or [],
            min_gpa=row.get("min_gpa"),
            other_mandatory_requirements=row.get("other_mandatory_requirements"),
            unknown_requirements=row.get("unknown_requirements") or [],
        )

    src_models = [
        OpportunitySourceOut(
            id=s.get("id"),
            source_name=s.get("source_name", ""),
            source_type=s.get("source_type", ""),
            source_url=s.get("source_url", ""),
            source_authority=s.get("source_authority", "tier_2"),
            discovered_at=s.get("discovered_at"),
            last_checked_at=s.get("last_checked_at"),
            verification_result=s.get("verification_result"),
        )
        for s in sources
    ]

    cycle_models = [
        OpportunityCycleOut(
            id=c.get("id"),
            cycle_year=c.get("cycle_year", 2025),
            observed_open_date=c.get("observed_open_date"),
            observed_close_date=c.get("observed_close_date"),
            date_precision=c.get("date_precision", "day"),
            verification_status=c.get("verification_status", "verified"),
            observation_type=c.get("observation_type", "confirmed"),
            notes=c.get("notes"),
        )
        for c in cycles
    ]

    return OpportunityOut(
        id=row["id"],
        company_name=row["company_name"],
        normalized_company=row.get("normalized_company") or row["company_name"],
        role_title=row["role_title"],
        opportunity_type=row.get("opportunity_type", "internship"),
        category=row.get("category", "general"),
        location=row.get("location"),
        work_arrangement=row.get("work_arrangement", "unknown"),
        country=row.get("country", "India"),
        is_india_eligible=bool(row.get("is_india_eligible", True)),
        compensation=row.get("compensation"),
        duration=row.get("duration"),
        official_application_url=row.get("official_application_url"),
        canonical_url=row.get("canonical_url", ""),
        current_status=row.get("current_status", OpportunityStatus.DISCOVERED),
        confirmed_open_date=row.get("confirmed_open_date"),
        confirmed_close_date=row.get("confirmed_close_date"),
        description=row.get("description"),
        last_verified_at=row.get("last_verified_at"),
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
        requirements=reqs,
        sources=src_models,
        cycles=cycle_models,
        is_saved=bool(row.get("is_saved", False)),
        is_dismissed=bool(row.get("is_dismissed", False)),
        application_status=row.get("application_status"),
        application_date=row.get("application_date"),
        personal_deadline=row.get("personal_deadline"),
        private_notes=row.get("private_notes"),
    )


async def upsert_opportunity(
    company_name: str,
    role_title: str,
    canonical_url: str,
    official_application_url: Optional[str] = None,
    current_status: str = OpportunityStatus.DISCOVERED,
    opportunity_type: str = "internship",
    category: str = "general",
    location: Optional[str] = None,
    work_arrangement: str = "unknown",
    country: str = "India",
    is_india_eligible: bool = True,
    compensation: Optional[str] = None,
    duration: Optional[str] = None,
    confirmed_open_date: Optional[date] = None,
    confirmed_close_date: Optional[date] = None,
    description: Optional[str] = None,
    last_verified_at: Optional[datetime] = None,
) -> int:
    """Insert or update an opportunity idempotently using canonical_url."""
    global _id_seq
    pool = await get_pool()
    norm_co = re.sub(r"[^\w\s-]", "", company_name.strip().lower())

    if not pool:
        # In-memory fallback
        for opp_id, opp in _in_memory_opportunities.items():
            if opp["canonical_url"] == canonical_url:
                opp.update({
                    "company_name": company_name,
                    "role_title": role_title,
                    "current_status": current_status,
                    "last_verified_at": last_verified_at or datetime.now(timezone.utc),
                })
                return opp_id
        _id_seq += 1
        _in_memory_opportunities[_id_seq] = {
            "id": _id_seq,
            "company_name": company_name,
            "normalized_company": norm_co,
            "role_title": role_title,
            "opportunity_type": opportunity_type,
            "category": category,
            "location": location,
            "work_arrangement": work_arrangement,
            "country": country,
            "is_india_eligible": is_india_eligible,
            "compensation": compensation,
            "duration": duration,
            "official_application_url": official_application_url,
            "canonical_url": canonical_url,
            "current_status": current_status,
            "confirmed_open_date": confirmed_open_date,
            "confirmed_close_date": confirmed_close_date,
            "description": description,
            "last_verified_at": last_verified_at,
            "sources": [],
            "cycles": [],
            "requirements": {},
        }
        return _id_seq

    query = """
    INSERT INTO opportunities (
        company_name, normalized_company, role_title, opportunity_type, category,
        location, work_arrangement, country, is_india_eligible, compensation, duration,
        official_application_url, canonical_url, current_status, confirmed_open_date,
        confirmed_close_date, description, last_verified_at, created_at, updated_at
    ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, now(), now()
    )
    ON CONFLICT (canonical_url) DO UPDATE SET
        company_name = EXCLUDED.company_name,
        normalized_company = EXCLUDED.normalized_company,
        role_title = EXCLUDED.role_title,
        opportunity_type = EXCLUDED.opportunity_type,
        category = EXCLUDED.category,
        location = COALESCE(EXCLUDED.location, opportunities.location),
        work_arrangement = CASE WHEN EXCLUDED.work_arrangement != 'unknown' THEN EXCLUDED.work_arrangement ELSE opportunities.work_arrangement END,
        country = EXCLUDED.country,
        is_india_eligible = EXCLUDED.is_india_eligible,
        compensation = COALESCE(EXCLUDED.compensation, opportunities.compensation),
        duration = COALESCE(EXCLUDED.duration, opportunities.duration),
        official_application_url = COALESCE(EXCLUDED.official_application_url, opportunities.official_application_url),
        current_status = CASE
            WHEN EXCLUDED.current_status IN ('OPEN_CONFIRMED', 'CLOSED_CONFIRMED') THEN EXCLUDED.current_status
            WHEN opportunities.current_status = 'OPEN_CONFIRMED' AND EXCLUDED.current_status != 'CLOSED_CONFIRMED' THEN opportunities.current_status
            ELSE EXCLUDED.current_status
        END,
        confirmed_open_date = COALESCE(EXCLUDED.confirmed_open_date, opportunities.confirmed_open_date),
        confirmed_close_date = COALESCE(EXCLUDED.confirmed_close_date, opportunities.confirmed_close_date),
        description = COALESCE(EXCLUDED.description, opportunities.description),
        last_verified_at = COALESCE(EXCLUDED.last_verified_at, opportunities.last_verified_at),
        updated_at = now()
    RETURNING id;
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            query,
            company_name.strip(),
            norm_co,
            role_title.strip(),
            opportunity_type,
            category,
            location,
            work_arrangement,
            country,
            is_india_eligible,
            compensation,
            duration,
            official_application_url,
            canonical_url,
            current_status,
            confirmed_open_date,
            confirmed_close_date,
            description,
            last_verified_at,
        )
        return row["id"]


async def upsert_opportunity_requirements(opp_id: int, reqs: Dict[str, Any]) -> None:
    pool = await get_pool()
    if not pool:
        if opp_id in _in_memory_opportunities:
            _in_memory_opportunities[opp_id]["requirements"] = reqs
        return

    query = """
    INSERT INTO opportunity_requirements (
        opportunity_id, eligible_degree_types, eligible_academic_years, eligible_graduation_years,
        eligible_countries, work_auth_required, sponsorship_available, required_skills,
        min_gpa, other_mandatory_requirements, unknown_requirements, last_updated_at
    ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now()
    )
    ON CONFLICT (opportunity_id) DO UPDATE SET
        eligible_degree_types = EXCLUDED.eligible_degree_types,
        eligible_academic_years = EXCLUDED.eligible_academic_years,
        eligible_graduation_years = EXCLUDED.eligible_graduation_years,
        eligible_countries = EXCLUDED.eligible_countries,
        work_auth_required = EXCLUDED.work_auth_required,
        sponsorship_available = EXCLUDED.sponsorship_available,
        required_skills = EXCLUDED.required_skills,
        min_gpa = EXCLUDED.min_gpa,
        other_mandatory_requirements = EXCLUDED.other_mandatory_requirements,
        unknown_requirements = EXCLUDED.unknown_requirements,
        last_updated_at = now();
    """
    async with pool.acquire() as conn:
        await conn.execute(
            query,
            opp_id,
            reqs.get("eligible_degree_types") or [],
            reqs.get("eligible_academic_years") or [],
            reqs.get("eligible_graduation_years") or [],
            reqs.get("eligible_countries") or [],
            reqs.get("work_auth_required"),
            reqs.get("sponsorship_available"),
            reqs.get("required_skills") or [],
            reqs.get("min_gpa"),
            reqs.get("other_mandatory_requirements"),
            reqs.get("unknown_requirements") or [],
        )


async def upsert_opportunity_cycle(
    opportunity_id: int,
    cycle_year: int,
    observed_open_date: Optional[date] = None,
    observed_close_date: Optional[date] = None,
    observation_type: str = "confirmed",
    notes: Optional[str] = None,
) -> None:
    pool = await get_pool()
    if not pool:
        if opportunity_id in _in_memory_opportunities:
            _in_memory_opportunities[opportunity_id]["cycles"].append({
                "cycle_year": cycle_year,
                "observed_open_date": observed_open_date,
                "observed_close_date": observed_close_date,
                "observation_type": observation_type,
                "notes": notes,
            })
        return

    query = """
    INSERT INTO opportunity_cycles (
        opportunity_id, cycle_year, observed_open_date, observed_close_date,
        date_precision, verification_status, observation_type, notes, created_at
    ) VALUES (
        $1, $2, $3, $4, 'day', 'verified', $5, $6, now()
    )
    ON CONFLICT (opportunity_id, cycle_year) DO UPDATE SET
        observed_open_date = COALESCE(EXCLUDED.observed_open_date, opportunity_cycles.observed_open_date),
        observed_close_date = COALESCE(EXCLUDED.observed_close_date, opportunity_cycles.observed_close_date),
        observation_type = EXCLUDED.observation_type,
        notes = COALESCE(EXCLUDED.notes, opportunity_cycles.notes);
    """
    async with pool.acquire() as conn:
        await conn.execute(query, opportunity_id, cycle_year, observed_open_date, observed_close_date, observation_type, notes)


async def add_opportunity_source(
    opportunity_id: int,
    source_name: str,
    source_type: str,
    source_url: str,
    source_authority: str = "tier_2",
    verification_result: Optional[str] = None,
) -> int:
    pool = await get_pool()
    if not pool:
        if opportunity_id in _in_memory_opportunities:
            _in_memory_opportunities[opportunity_id].setdefault("sources", []).append({
                "id": len(_in_memory_opportunities[opportunity_id].get("sources", [])) + 1,
                "source_name": source_name,
                "source_type": source_type,
                "source_url": source_url,
                "source_authority": source_authority,
                "verification_result": verification_result,
            })
        return 1

    query = """
    INSERT INTO opportunity_sources (
        opportunity_id, source_name, source_type, source_url, source_authority,
        discovered_at, last_checked_at, verification_result
    ) VALUES ($1, $2, $3, $4, $5, now(), now(), $6)
    RETURNING id;
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, opportunity_id, source_name, source_type, source_url, source_authority, verification_result)
        return row["id"]


async def get_all_opportunities(
    user_id: Optional[str] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,
    work_arrangement: Optional[str] = None,
    country: Optional[str] = None,
    search: Optional[str] = None,
    india_only: bool = False,
    page: int = 1,
    page_size: int = 25,
) -> Tuple[List[OpportunityOut], int]:
    pool = await get_pool()
    if not pool:
        items = list(_in_memory_opportunities.values())
        if status:
            items = [i for i in items if i.get("current_status") == status]
        if category:
            items = [i for i in items if i.get("category") == category]
        if india_only:
            items = [i for i in items if i.get("is_india_eligible") is True]
        if search:
            q = search.strip().lower()
            items = [i for i in items if q in i.get("company_name", "").lower() or q in i.get("role_title", "").lower()]

        out_models = []
        for i in items:
            opp_copy = dict(i)
            if user_id:
                user_state = _in_memory_user_opps.get(f"{user_id}:{i['id']}", {})
                opp_copy["is_saved"] = bool(user_state.get("is_saved", False))
                opp_copy["application_status"] = user_state.get("application_status")
                opp_copy["private_notes"] = user_state.get("private_notes")
            out_models.append(
                _parse_row_to_opportunity(opp_copy, opp_copy.get("sources", []), opp_copy.get("cycles", []))
            )
        return out_models, len(out_models)

    conditions = ["1=1"]
    args: List[Any] = [user_id or "default_user"]

    if status:
        args.append(status)
        conditions.append(f"o.current_status = ${len(args)}")
    if category:
        args.append(category)
        conditions.append(f"o.category = ${len(args)}")
    if work_arrangement:
        args.append(work_arrangement)
        conditions.append(f"o.work_arrangement = ${len(args)}")
    if india_only:
        conditions.append("o.is_india_eligible IS TRUE")
    if search:
        args.append(f"%{search.strip().lower()}%")
        conditions.append(f"(LOWER(o.company_name) LIKE ${len(args)} OR LOWER(o.role_title) LIKE ${len(args)})")

    where_sql = " AND ".join(conditions)

    count_sql = f"""
    SELECT COUNT(*) FROM opportunities o
    LEFT JOIN user_opportunities uo ON o.id = uo.opportunity_id AND uo.user_id = $1
    WHERE {where_sql}
    """
    offset = (page - 1) * page_size
    args.extend([page_size, offset])

    data_sql = f"""
    SELECT o.*,
           uo.is_saved, uo.is_dismissed, uo.application_status, uo.application_date,
           uo.personal_deadline, uo.private_notes,
           r.eligible_degree_types, r.eligible_academic_years, r.eligible_graduation_years,
           r.eligible_countries, r.work_auth_required, r.sponsorship_available, r.required_skills,
           r.min_gpa, r.other_mandatory_requirements, r.unknown_requirements
    FROM opportunities o
    LEFT JOIN user_opportunities uo ON o.id = uo.opportunity_id AND uo.user_id = $1
    LEFT JOIN opportunity_requirements r ON o.id = r.opportunity_id
    WHERE {where_sql}
    ORDER BY
        CASE o.current_status
            WHEN 'OPEN_CONFIRMED' THEN 1
            WHEN 'UPCOMING_CONFIRMED' THEN 2
            WHEN 'ANNOUNCED' THEN 3
            ELSE 4
        END ASC,
        o.confirmed_close_date ASC NULLS LAST,
        o.id DESC
    LIMIT ${len(args)-1} OFFSET ${len(args)};
    """

    async with pool.acquire() as conn:
        total = await conn.fetchval(count_sql, *args[:-2]) or 0
        rows = await conn.fetch(data_sql, *args)

        opp_ids = [r["id"] for r in rows]
        sources_map: Dict[int, list] = {}
        cycles_map: Dict[int, list] = {}

        if opp_ids:
            all_srcs = await conn.fetch("SELECT * FROM opportunity_sources WHERE opportunity_id = ANY($1::int[])", opp_ids)
            for s in all_srcs:
                sources_map.setdefault(s["opportunity_id"], []).append(dict(s))

            all_cycles = await conn.fetch("SELECT * FROM opportunity_cycles WHERE opportunity_id = ANY($1::int[]) ORDER BY cycle_year ASC", opp_ids)
            for c in all_cycles:
                cycles_map.setdefault(c["opportunity_id"], []).append(dict(c))

        results: List[OpportunityOut] = [
            _parse_row_to_opportunity(dict(r), sources_map.get(r["id"], []), cycles_map.get(r["id"], []))
            for r in rows
        ]

        return results, total


async def get_opportunity_by_id(opportunity_id: int, user_id: Optional[str] = None) -> Optional[OpportunityOut]:
    pool = await get_pool()
    if not pool:
        opp = _in_memory_opportunities.get(opportunity_id)
        if opp:
            opp_copy = dict(opp)
            if user_id:
                user_state = _in_memory_user_opps.get(f"{user_id}:{opportunity_id}", {})
                opp_copy["is_saved"] = bool(user_state.get("is_saved", False))
                opp_copy["application_status"] = user_state.get("application_status")
                opp_copy["private_notes"] = user_state.get("private_notes")
            return _parse_row_to_opportunity(opp_copy, opp_copy.get("sources", []), opp_copy.get("cycles", []))
        return None

    query = """
    SELECT o.*,
           uo.is_saved, uo.is_dismissed, uo.application_status, uo.application_date,
           uo.personal_deadline, uo.private_notes,
           r.eligible_degree_types, r.eligible_academic_years, r.eligible_graduation_years,
           r.eligible_countries, r.work_auth_required, r.sponsorship_available, r.required_skills,
           r.min_gpa, r.other_mandatory_requirements, r.unknown_requirements
    FROM opportunities o
    LEFT JOIN user_opportunities uo ON o.id = uo.opportunity_id AND uo.user_id = $2
    LEFT JOIN opportunity_requirements r ON o.id = r.opportunity_id
    WHERE o.id = $1
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, opportunity_id, user_id or "default_user")
        if not row:
            return None
        src_rows = await conn.fetch("SELECT * FROM opportunity_sources WHERE opportunity_id = $1", opportunity_id)
        cycle_rows = await conn.fetch("SELECT * FROM opportunity_cycles WHERE opportunity_id = $1 ORDER BY cycle_year ASC", opportunity_id)
        return _parse_row_to_opportunity(dict(row), [dict(s) for s in src_rows], [dict(c) for c in cycle_rows])


async def update_opportunity_status(opportunity_id: int, new_status: str, verified_at: datetime) -> None:
    pool = await get_pool()
    if not pool:
        if opportunity_id in _in_memory_opportunities:
            _in_memory_opportunities[opportunity_id]["current_status"] = new_status
            _in_memory_opportunities[opportunity_id]["last_verified_at"] = verified_at
        return

    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE opportunities SET current_status = $1, last_verified_at = $2, updated_at = now() WHERE id = $3",
            new_status, verified_at, opportunity_id,
        )


async def add_status_history(
    opportunity_id: int,
    prev_status: str,
    new_status: str,
    evidence_source: str,
    reason: str,
) -> None:
    pool = await get_pool()
    if not pool:
        return
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO opportunity_status_history (
                opportunity_id, previous_status, new_status, evidence_source, reason_for_change, observed_at
            ) VALUES ($1, $2, $3, $4, $5, now());
            """,
            opportunity_id, prev_status, new_status, evidence_source, reason,
        )


async def get_user_opportunity_profile(user_id: str) -> Optional[UserOpportunityProfileIn]:
    pool = await get_pool()
    if not pool:
        data = _in_memory_user_profiles.get(user_id)
        return UserOpportunityProfileIn(**data) if data else None

    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM user_opportunity_profiles WHERE user_id = $1", user_id)
        if not row:
            return None
        return UserOpportunityProfileIn(
            degree=row["degree"],
            degree_specialization=row["degree_specialization"],
            university=row["university"],
            academic_year=row["academic_year"],
            grad_month=row["grad_month"],
            grad_year=row["grad_year"],
            country_of_study=row["country_of_study"] or "India",
            country_of_residence=row["country_of_residence"] or "India",
            preferred_locations=row["preferred_locations"] or ["India", "Remote"],
            preferred_work_arrangements=row["preferred_work_arrangements"] or ["remote", "hybrid", "onsite"],
            preferred_roles=row["preferred_roles"] or [],
            skills=row["skills"] or [],
            min_compensation=row["min_compensation"],
            resume_url=row["resume_url"],
        )


async def upsert_user_opportunity_profile(user_id: str, p: UserOpportunityProfileIn) -> None:
    pool = await get_pool()
    if not pool:
        _in_memory_user_profiles[user_id] = p.model_dump()
        return

    query = """
    INSERT INTO user_opportunity_profiles (
        user_id, degree, degree_specialization, university, academic_year, grad_month, grad_year,
        country_of_study, country_of_residence, preferred_locations, preferred_work_arrangements,
        preferred_roles, skills, min_compensation, resume_url, created_at, updated_at
    ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now(), now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        degree = EXCLUDED.degree,
        degree_specialization = EXCLUDED.degree_specialization,
        university = EXCLUDED.university,
        academic_year = EXCLUDED.academic_year,
        grad_month = EXCLUDED.grad_month,
        grad_year = EXCLUDED.grad_year,
        country_of_study = EXCLUDED.country_of_study,
        country_of_residence = EXCLUDED.country_of_residence,
        preferred_locations = EXCLUDED.preferred_locations,
        preferred_work_arrangements = EXCLUDED.preferred_work_arrangements,
        preferred_roles = EXCLUDED.preferred_roles,
        skills = EXCLUDED.skills,
        min_compensation = EXCLUDED.min_compensation,
        resume_url = EXCLUDED.resume_url,
        updated_at = now();
    """
    async with pool.acquire() as conn:
        await conn.execute(
            query,
            user_id,
            p.degree,
            p.degree_specialization,
            p.university,
            p.academic_year,
            p.grad_month,
            p.grad_year,
            p.country_of_study,
            p.country_of_residence,
            p.preferred_locations,
            p.preferred_work_arrangements,
            p.preferred_roles,
            p.skills,
            p.min_compensation,
            p.resume_url,
        )


async def upsert_user_saved_opportunity(user_id: str, opportunity_id: int, is_saved: bool = True) -> None:
    pool = await get_pool()
    if not pool:
        key = f"{user_id}:{opportunity_id}"
        if key not in _in_memory_user_opps:
            _in_memory_user_opps[key] = {}
        _in_memory_user_opps[key]["is_saved"] = is_saved
        return

    query = """
    INSERT INTO user_opportunities (user_id, opportunity_id, is_saved, created_at, updated_at)
    VALUES ($1, $2, $3, now(), now())
    ON CONFLICT (user_id, opportunity_id) DO UPDATE SET is_saved = EXCLUDED.is_saved, updated_at = now();
    """
    async with pool.acquire() as conn:
        await conn.execute(query, user_id, opportunity_id, is_saved)


async def delete_user_saved_opportunity(user_id: str, opportunity_id: int) -> None:
    await upsert_user_saved_opportunity(user_id, opportunity_id, is_saved=False)


async def get_user_saved_opportunities(user_id: str) -> List[OpportunityOut]:
    opps, _ = await get_all_opportunities(user_id=user_id, page=1, page_size=100)
    return [o for o in opps if o.is_saved]


async def upsert_user_application_status(
    user_id: str,
    opportunity_id: int,
    status: str,
    app_date: Optional[date] = None,
    personal_deadline: Optional[date] = None,
    notes: Optional[str] = None,
) -> None:
    pool = await get_pool()
    if not pool:
        key = f"{user_id}:{opportunity_id}"
        if key not in _in_memory_user_opps:
            _in_memory_user_opps[key] = {}
        _in_memory_user_opps[key].update({
            "application_status": status,
            "application_date": app_date,
            "personal_deadline": personal_deadline,
            "private_notes": notes,
        })
        return

    query = """
    INSERT INTO user_opportunities (
        user_id, opportunity_id, application_status, application_date, personal_deadline, private_notes, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, now(), now())
    ON CONFLICT (user_id, opportunity_id) DO UPDATE SET
        application_status = EXCLUDED.application_status,
        application_date = COALESCE(EXCLUDED.application_date, user_opportunities.application_date),
        personal_deadline = COALESCE(EXCLUDED.personal_deadline, user_opportunities.personal_deadline),
        private_notes = COALESCE(EXCLUDED.private_notes, user_opportunities.private_notes),
        updated_at = now();
    """
    async with pool.acquire() as conn:
        await conn.execute(query, user_id, opportunity_id, status, app_date, personal_deadline, notes)


async def get_user_application_tracking(user_id: str) -> List[OpportunityOut]:
    opps, _ = await get_all_opportunities(user_id=user_id, page=1, page_size=100)
    return [o for o in opps if o.application_status]


async def get_radar_overview_stats(user_id: str) -> Dict[str, Any]:
    pool = await get_pool()
    if not pool:
        return {
            "verified_open_count": sum(1 for o in _in_memory_opportunities.values() if o.get("current_status") == "OPEN_CONFIRMED"),
            "strong_matches_count": 0,
            "opening_soon_count": sum(1 for o in _in_memory_opportunities.values() if o.get("current_status") in ("UPCOMING_CONFIRMED", "ANNOUNCED")),
            "upcoming_deadlines_count": 0,
            "saved_count": sum(1 for v in _in_memory_user_opps.values() if v.get("is_saved")),
            "applications_in_progress_count": sum(1 for v in _in_memory_user_opps.values() if v.get("application_status")),
            "last_sync_at": None,
            "total_tracked_opportunities": len(_in_memory_opportunities),
        }

    async with pool.acquire() as conn:
        total = await conn.fetchval("SELECT COUNT(*) FROM opportunities") or 0
        open_cnt = await conn.fetchval("SELECT COUNT(*) FROM opportunities WHERE current_status = 'OPEN_CONFIRMED'") or 0
        upcoming_cnt = await conn.fetchval("SELECT COUNT(*) FROM opportunities WHERE current_status IN ('UPCOMING_CONFIRMED', 'ANNOUNCED')") or 0
        saved_cnt = await conn.fetchval("SELECT COUNT(*) FROM user_opportunities WHERE user_id = $1 AND is_saved IS TRUE", user_id) or 0
        apps_cnt = await conn.fetchval(
            "SELECT COUNT(*) FROM user_opportunities WHERE user_id = $1 AND application_status IS NOT NULL",
            user_id,
        ) or 0
        last_sync = await conn.fetchval(
            "SELECT run_completed_at FROM opportunity_sync_runs WHERE status = 'completed' ORDER BY run_completed_at DESC LIMIT 1"
        )
        return {
            "verified_open_count": open_cnt,
            "strong_matches_count": open_cnt,
            "opening_soon_count": upcoming_cnt,
            "upcoming_deadlines_count": 0,
            "saved_count": saved_cnt,
            "applications_in_progress_count": apps_cnt,
            "last_sync_at": last_sync,
            "total_tracked_opportunities": total,
        }


async def create_sync_run(source_id: str, source_type: str = "multi_source_radar") -> int:
    pool = await get_pool()
    if not pool:
        return 1
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO opportunity_sync_runs (source_id, source_type, status, run_started_at) VALUES ($1, $2, 'running', now()) RETURNING id",
            source_id,
            source_type,
        )
        return row["id"]


async def finish_sync_run(
    run_id: int,
    status: str,
    records_discovered: int,
    records_updated: int,
    records_skipped: int,
    failures: int,
    error_summary: str,
) -> None:
    pool = await get_pool()
    if not pool:
        return
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE opportunity_sync_runs SET
                status = $1,
                records_discovered = $2,
                records_updated = $3,
                records_skipped = $4,
                verification_failures = $5,
                error_summary = $6,
                run_completed_at = now()
            WHERE id = $7
            """,
            status, records_discovered, records_updated, records_skipped, failures, error_summary, run_id,
        )


async def get_last_sync_run() -> Optional[Dict[str, Any]]:
    pool = await get_pool()
    if not pool:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM opportunity_sync_runs ORDER BY id DESC LIMIT 1"
        )
        return dict(row) if row else None
