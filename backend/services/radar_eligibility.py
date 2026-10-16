"""
Compass — Internship Radar Deterministic Eligibility Assessment Engine.

Evaluates an opportunity's published requirements against a student's personal profile.
Produces inspectable classifications (ELIGIBLE, POTENTIAL_MATCH, INELIGIBLE, INSUFFICIENT_INFORMATION)
with granular reason codes and evidence summaries.

Rules:
1. Missing graduation year or degree requirement is NOT assumed to mean open to all.
2. Missing work auth requirement is NOT assumed to mean universal eligibility.
3. Every classification is backed by structured reasons inspectable by the user.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple
from backend.models_radar import (
    EligibilityClassification,
    OpportunityOut,
    OpportunityRequirementsOut,
    UserOpportunityProfileIn,
)


def evaluate_eligibility(
    opportunity: OpportunityOut,
    profile: Optional[UserOpportunityProfileIn],
) -> Tuple[str, str, List[Dict[str, Any]]]:
    """
    Evaluates eligibility for a given opportunity and profile.

    Returns:
        (classification, explanation, reasons_list)
    """
    if profile is None:
        return (
            EligibilityClassification.INSUFFICIENT_INFORMATION,
            "Complete your profile (academic year, graduation year, degree) to see verified eligibility.",
            [{"field": "profile", "status": "missing", "detail": "No student profile configured"}]
        )

    reqs: Optional[OpportunityRequirementsOut] = opportunity.requirements
    reasons: List[Dict[str, Any]] = []

    # If opportunity has zero requirement data
    if not reqs or (
        not reqs.eligible_academic_years
        and not reqs.eligible_graduation_years
        and not reqs.eligible_degree_types
        and not reqs.eligible_countries
        and reqs.work_auth_required is None
    ):
        reasons.append({
            "field": "requirements_data",
            "status": "unspecified",
            "detail": "The listing does not specify explicit academic year or graduation cutoff requirements yet."
        })
        return (
            EligibilityClassification.INSUFFICIENT_INFORMATION,
            "Requirements for this position are not fully specified in the public listing. Verification needed.",
            reasons
        )

    # 1. Academic Year Check
    academic_year_status = "pass"
    if reqs.eligible_academic_years:
        if profile.academic_year is None:
            reasons.append({
                "field": "academic_year",
                "status": "unknown",
                "detail": f"Position requires academic year(s) {reqs.eligible_academic_years}, but your year is not set in profile."
            })
            academic_year_status = "unknown"
        elif profile.academic_year in reqs.eligible_academic_years:
            reasons.append({
                "field": "academic_year",
                "status": "pass",
                "detail": f"Your academic year ({profile.academic_year}) matches accepted years: {reqs.eligible_academic_years}."
            })
        else:
            reasons.append({
                "field": "academic_year",
                "status": "fail",
                "detail": f"Position targets year(s) {reqs.eligible_academic_years}; your profile indicates year {profile.academic_year}."
            })
            academic_year_status = "fail"

    # 2. Graduation Year Check
    grad_year_status = "pass"
    if reqs.eligible_graduation_years:
        if profile.grad_year is None:
            reasons.append({
                "field": "grad_year",
                "status": "unknown",
                "detail": f"Target graduation batch is {reqs.eligible_graduation_years}, but your graduation year is unset."
            })
            grad_year_status = "unknown"
        elif profile.grad_year in reqs.eligible_graduation_years:
            reasons.append({
                "field": "grad_year",
                "status": "pass",
                "detail": f"Your graduation year ({profile.grad_year}) matches eligible batch: {reqs.eligible_graduation_years}."
            })
        else:
            reasons.append({
                "field": "grad_year",
                "status": "fail",
                "detail": f"Requires graduation in {reqs.eligible_graduation_years}. Your profile indicates {profile.grad_year}."
            })
            grad_year_status = "fail"

    # 3. Country & Indian Student Eligibility Check
    country_status = "pass"
    if reqs.eligible_countries:
        student_country = (profile.country_of_residence or profile.country_of_study or "India").lower()
        allowed_countries = [c.lower() for c in reqs.eligible_countries]
        india_in_allowed = any("india" in c for c in allowed_countries)

        if not opportunity.is_india_eligible and not india_in_allowed:
            reasons.append({
                "field": "country",
                "status": "fail",
                "detail": f"Position is restricted to applicants residing in {reqs.eligible_countries}."
            })
            country_status = "fail"
        elif india_in_allowed or opportunity.is_india_eligible:
            reasons.append({
                "field": "country",
                "status": "pass",
                "detail": "Open to applicants studying in India or remote applicants."
            })
        else:
            reasons.append({
                "field": "country",
                "status": "unknown",
                "detail": f"Country eligibility ({reqs.eligible_countries}) requires verification for Indian applicants."
            })
            country_status = "unknown"

    # 4. Work Authorization & Sponsorship Check
    work_auth_status = "pass"
    if reqs.work_auth_required is True:
        if reqs.sponsorship_available is False:
            # If not an Indian opportunity and no sponsorship
            if opportunity.country.lower() != "india" and opportunity.work_arrangement != "remote":
                reasons.append({
                    "field": "work_auth",
                    "status": "fail",
                    "detail": "Requires local work authorization in host country with no visa sponsorship available."
                })
                work_auth_status = "fail"
            else:
                reasons.append({
                    "field": "work_auth",
                    "status": "pass",
                    "detail": "Work authorization satisfied in domestic or remote jurisdiction."
                })
        elif reqs.sponsorship_available is True:
            reasons.append({
                "field": "work_auth",
                "status": "pass",
                "detail": "International visa sponsorship is explicitly confirmed available."
            })
        else:
            reasons.append({
                "field": "work_auth",
                "status": "unknown",
                "detail": "Work authorization needed; visa sponsorship policy is currently unconfirmed."
            })
            work_auth_status = "unknown"

    # 5. Degree Type Check
    degree_status = "pass"
    if reqs.eligible_degree_types:
        if not profile.degree:
            reasons.append({
                "field": "degree",
                "status": "unknown",
                "detail": f"Requires degree type ({reqs.eligible_degree_types}), but degree is unconfigured in profile."
            })
            degree_status = "unknown"
        else:
            user_degree = profile.degree.lower()
            match = any(d.lower() in user_degree or user_degree in d.lower() for d in reqs.eligible_degree_types)
            if match or "bachelor" in user_degree or "b.tech" in user_degree or "bs" in user_degree:
                reasons.append({
                    "field": "degree",
                    "status": "pass",
                    "detail": f"Degree ({profile.degree}) aligns with accepted degrees: {reqs.eligible_degree_types}."
                })
            else:
                reasons.append({
                    "field": "degree",
                    "status": "unknown",
                    "detail": f"Accepted degree types: {reqs.eligible_degree_types}. Profile degree is {profile.degree}."
                })
                degree_status = "unknown"

    # 6. Technical Skills Overlap (Informational / Relevance)
    if reqs.required_skills and profile.skills:
        req_set = {s.lower() for s in reqs.required_skills}
        profile_set = {s.lower() for s in profile.skills}
        matched_skills = list(req_set.intersection(profile_set))
        reasons.append({
            "field": "skills",
            "status": "info",
            "detail": f"Skills matched: {matched_skills if matched_skills else 'None directly overlap'}. Required: {reqs.required_skills}."
        })

    # -----------------------------------------------------------------------
    # Decision Matrix
    # -----------------------------------------------------------------------
    # Any confirmed hard failure => INELIGIBLE
    if any(s == "fail" for s in [academic_year_status, grad_year_status, country_status, work_auth_status]):
        failed_fields = [r["field"] for r in reasons if r["status"] == "fail"]
        explanation = f"Ineligible: Requirements for {', '.join(failed_fields)} do not match your current academic profile."
        return (EligibilityClassification.INELIGIBLE, explanation, reasons)

    # Any unknown requirement => POTENTIAL_MATCH
    unknowns = [r for r in reasons if r["status"] == "unknown"]
    if unknowns:
        unknown_fields = [u["field"] for u in unknowns]
        explanation = f"Potential match: Aligns with your interests, but requires verification on: {', '.join(unknown_fields)}."
        return (EligibilityClassification.POTENTIAL_MATCH, explanation, reasons)

    # All known requirements passed
    explanation = "Strong match: Your academic year, graduation cohort, and country eligibility satisfy all published requirements."
    return (EligibilityClassification.ELIGIBLE, explanation, reasons)
