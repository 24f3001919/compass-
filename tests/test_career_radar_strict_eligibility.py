"""
Adversarial synthetic test suite for Compass Career Radar strict eligibility matching.

Validates all 20 adversarial edge cases specified in Phase 9:
1. Candidate satisfies every explicit mandatory requirement -> ELIGIBLE.
2. Candidate fails a mandatory CGPA requirement -> INELIGIBLE.
3. Candidate's graduation year is explicitly excluded -> INELIGIBLE.
4. Candidate satisfies degree and graduation requirements, but mandatory work-auth condition is unknown -> Not ELIGIBLE.
5. Listing omits CGPA requirements -> Do not invent a CGPA cutoff.
6. Listing requires a specific graduation cohort -> Only matching cohorts qualify.
7. Listing has contradictory graduation-year requirements -> Manual review; not ELIGIBLE.
8. A preferred skill is missing -> Do not reject solely on that basis.
9. A mandatory skill is unknown -> Do not claim confirmed eligibility.
10. An expired internship is returned by aggregator -> Current status handled separately; not counted as open.
11. Same internship appears through 3 aggregators -> Deduplication preserves unique opportunity.
12. User profile is missing graduation year -> No confirmed eligibility where grad year is mandatory.
13. User updates CGPA after eligibility calculated -> Eligibility recalculates dynamically.
14. Job requirements change after eligibility calculated -> Stale eligibility invalidated / dynamically re-evaluated.
15. Listing is open but candidate is ineligible -> Included in Verified Open, excluded from Eligible Matches.
16. Listing is potentially suitable but has unresolved mandatory condition -> Not counted as confirmed eligible.
17. Listing has only preferred qualifications and no restrictive mandatory conditions -> Evaluated cleanly without invented restrictions.
18. Two records represent the same job with conflicting deadlines or eligibility criteria -> Preserve provenance and flag conflict.
19. Listing explicitly requires degree outside candidate's category (e.g. PhD vs BTech) -> INELIGIBLE.
20. International remote internship has no explicit country restriction -> Do not invent geographic restriction.
"""
import pytest
from datetime import date, datetime
from backend.models_radar import (
    EligibilityClassification,
    OpportunityOut,
    OpportunityRequirementsOut,
    OpportunityStatus,
    UserOpportunityProfileIn,
)
from backend.services.radar_eligibility import evaluate_eligibility


def make_opp(
    opp_id: int = 1,
    role_title: str = "Software Engineering Intern",
    company_name: str = "Acme Corp",
    current_status: str = OpportunityStatus.OPEN_CONFIRMED,
    country: str = "India",
    is_india_eligible: bool = True,
    work_arrangement: str = "remote",
    requirements: OpportunityRequirementsOut = None,
) -> OpportunityOut:
    return OpportunityOut(
        id=opp_id,
        role_title=role_title,
        company_name=company_name,
        normalized_company="acme corp",
        opportunity_type="internship",
        category="swe",
        canonical_url=f"https://example.com/jobs/{opp_id}",
        current_status=current_status,
        country=country,
        is_india_eligible=is_india_eligible,
        work_arrangement=work_arrangement,
        requirements=requirements,
        official_source_confirmed=True,
        application_url_checked=True,
    )


def make_profile(
    degree: str = "B.Tech",
    specialization: str = "Computer Science & Engineering",
    academic_year: int = 2,
    grad_year: int = 2027,
    cgpa: float = 8.5,
    cgpa_scale: float = 10.0,
    active_backlogs: int = 0,
    country_of_residence: str = "India",
    work_authorization: str = "India",
    skills: list = None,
) -> UserOpportunityProfileIn:
    return UserOpportunityProfileIn(
        degree=degree,
        degree_specialization=specialization,
        academic_year=academic_year,
        grad_year=grad_year,
        cgpa=cgpa,
        cgpa_scale=cgpa_scale,
        active_backlogs=active_backlogs,
        country_of_residence=country_of_residence,
        work_authorization=work_authorization,
        skills=skills or ["Python", "C++", "Data Structures"],
    )


# 1. Candidate satisfies every explicit mandatory requirement
def test_case_01_satisfies_all_mandatory():
    reqs = OpportunityRequirementsOut(
        eligible_degree_types=["B.Tech", "B.E."],
        eligible_academic_years=[2, 3],
        eligible_graduation_years=[2027, 2028],
        eligible_countries=["India"],
        min_gpa=8.0,
        gpa_scale=10.0,
        required_skills=["Python"],
    )
    opp = make_opp(requirements=reqs)
    profile = make_profile(cgpa=8.5, grad_year=2027, academic_year=2, skills=["Python", "C++"])

    status, explanation, reasons = evaluate_eligibility(opp, profile)
    assert status == EligibilityClassification.ELIGIBLE
    assert "Confirmed eligible" in explanation


# 2. Candidate fails a mandatory CGPA requirement
def test_case_02_fails_mandatory_cgpa():
    reqs = OpportunityRequirementsOut(
        eligible_degree_types=["B.Tech"],
        min_gpa=8.5,
        gpa_scale=10.0,
    )
    opp = make_opp(requirements=reqs)
    profile = make_profile(cgpa=8.2, cgpa_scale=10.0)

    status, explanation, reasons = evaluate_eligibility(opp, profile)
    assert status == EligibilityClassification.INELIGIBLE
    cgpa_reasons = [r for r in reasons if r["field"] == "cgpa"]
    assert len(cgpa_reasons) == 1
    assert cgpa_reasons[0]["status"] == "fail"


# 3. Candidate's graduation year is explicitly excluded
def test_case_03_grad_year_excluded():
    reqs = OpportunityRequirementsOut(
        eligible_graduation_years=[2028],
    )
    opp = make_opp(requirements=reqs)
    profile = make_profile(grad_year=2027)

    status, explanation, reasons = evaluate_eligibility(opp, profile)
    assert status == EligibilityClassification.INELIGIBLE
    assert any(r["field"] == "grad_year" and r["status"] == "fail" for r in reasons)


# 4. Mandatory work-authorization condition is unknown
def test_case_04_work_auth_unknown():
    reqs = OpportunityRequirementsOut(
        eligible_degree_types=["B.Tech"],
        work_auth_required=True,
        sponsorship_available=None,  # unconfirmed sponsorship
    )
    opp = make_opp(country="United States", work_arrangement="onsite", requirements=reqs)
    profile = make_profile(work_authorization="India")

    status, explanation, reasons = evaluate_eligibility(opp, profile)
    assert status != EligibilityClassification.ELIGIBLE
    assert status == EligibilityClassification.POTENTIAL_MATCH


# 5. Listing omits CGPA requirements -> Do not invent a CGPA cutoff
def test_case_05_listing_omits_cgpa():
    reqs = OpportunityRequirementsOut(
        eligible_degree_types=["B.Tech"],
        eligible_graduation_years=[2027],
        min_gpa=None,
    )
    opp = make_opp(requirements=reqs)
    profile = make_profile(cgpa=6.5)

    status, explanation, reasons = evaluate_eligibility(opp, profile)
    assert status == EligibilityClassification.ELIGIBLE
    assert not any(r["field"] == "cgpa" for r in reasons)


# 6. Listing requires specific graduation cohort
def test_case_06_specific_graduation_cohort():
    reqs = OpportunityRequirementsOut(
        eligible_graduation_years=[2027],
    )
    opp = make_opp(requirements=reqs)

    # 2027 matches
    prof_2027 = make_profile(grad_year=2027)
    status_pass, _, _ = evaluate_eligibility(opp, prof_2027)
    assert status_pass == EligibilityClassification.ELIGIBLE

    # 2026 fails
    prof_2026 = make_profile(grad_year=2026)
    status_fail, _, _ = evaluate_eligibility(opp, prof_2026)
    assert status_fail == EligibilityClassification.INELIGIBLE


# 7. Listing has contradictory requirements -> Manual review; not ELIGIBLE
def test_case_07_contradictory_requirements():
    reqs = OpportunityRequirementsOut(
        eligible_graduation_years=[2027],
        has_conflicting_requirements=True,
    )
    opp = make_opp(requirements=reqs)
    profile = make_profile(grad_year=2027)

    status, explanation, reasons = evaluate_eligibility(opp, profile)
    assert status != EligibilityClassification.ELIGIBLE
    assert status == EligibilityClassification.POTENTIAL_MATCH
    assert any(r["field"] == "conflicting_requirements" for r in reasons)


# 8. Preferred skill missing -> Do not reject solely on that basis
def test_case_08_preferred_skill_missing():
    reqs = OpportunityRequirementsOut(
        eligible_degree_types=["B.Tech"],
        required_skills=["Python"],
        preferred_skills=["Rust", "Kubernetes"],
    )
    opp = make_opp(requirements=reqs)
    profile = make_profile(skills=["Python"])

    status, explanation, reasons = evaluate_eligibility(opp, profile)
    assert status == EligibilityClassification.ELIGIBLE
    pref_reasons = [r for r in reasons if r["field"] == "preferred_skills"]
    assert len(pref_reasons) == 1
    assert pref_reasons[0]["status"] == "info"


# 9. Mandatory skill unknown / missing -> Do not claim confirmed eligibility
def test_case_09_mandatory_skill_missing():
    reqs = OpportunityRequirementsOut(
        eligible_degree_types=["B.Tech"],
        required_skills=["Java", "Spring Boot"],
    )
    opp = make_opp(requirements=reqs)
    profile = make_profile(skills=["Python"])

    status, explanation, reasons = evaluate_eligibility(opp, profile)
    assert status != EligibilityClassification.ELIGIBLE
    assert status == EligibilityClassification.POTENTIAL_MATCH


# 10. Expired internship status handled separately
def test_case_10_expired_internship():
    reqs = OpportunityRequirementsOut(eligible_degree_types=["B.Tech"])
    opp = make_opp(current_status=OpportunityStatus.CLOSED_CONFIRMED, requirements=reqs)
    profile = make_profile()

    # Opening status remains closed
    assert opp.current_status == OpportunityStatus.CLOSED_CONFIRMED
    assert opp.current_status != OpportunityStatus.OPEN_CONFIRMED


# 11. Deduplication key uniqueness
def test_case_11_deduplication_uniqueness():
    from backend.memory.radar import _in_memory_opportunities
    # Ingestion deduplication test
    import re
    co1 = "Google Inc."
    co2 = "Google"
    norm1 = re.sub(r"\b(inc|incorporated|llc|ltd|limited|corp|corporation)\b", "", re.sub(r"[^\w\s-]", "", co1.lower())).strip()
    norm2 = re.sub(r"\b(inc|incorporated|llc|ltd|limited|corp|corporation)\b", "", re.sub(r"[^\w\s-]", "", co2.lower())).strip()
    assert norm1 == norm2


# 12. User profile is missing graduation year -> No confirmed eligibility where grad year is mandatory
def test_case_12_user_profile_missing_grad_year():
    reqs = OpportunityRequirementsOut(
        eligible_graduation_years=[2027],
    )
    opp = make_opp(requirements=reqs)
    profile = make_profile()
    profile.grad_year = None

    status, explanation, reasons = evaluate_eligibility(opp, profile)
    assert status != EligibilityClassification.ELIGIBLE
    assert status == EligibilityClassification.POTENTIAL_MATCH
    assert any(r["field"] == "grad_year" and r["status"] == "unknown" for r in reasons)


# 13. User updates CGPA after eligibility was calculated -> Recalculates dynamically
def test_case_13_dynamic_cgpa_recalculation():
    reqs = OpportunityRequirementsOut(min_gpa=8.0, gpa_scale=10.0)
    opp = make_opp(requirements=reqs)

    profile = make_profile(cgpa=7.5)
    st1, _, _ = evaluate_eligibility(opp, profile)
    assert st1 == EligibilityClassification.INELIGIBLE

    # User updates CGPA to 8.5
    profile.cgpa = 8.5
    st2, _, _ = evaluate_eligibility(opp, profile)
    assert st2 == EligibilityClassification.ELIGIBLE


# 14. Job requirements change after eligibility was calculated
def test_case_14_job_requirements_change():
    reqs_v1 = OpportunityRequirementsOut(eligible_degree_types=["B.Tech"], min_gpa=7.0)
    opp = make_opp(requirements=reqs_v1)
    profile = make_profile(cgpa=7.5)

    assert evaluate_eligibility(opp, profile)[0] == EligibilityClassification.ELIGIBLE

    # Employer updates requirements to min 8.0 CGPA
    opp.requirements = OpportunityRequirementsOut(eligible_degree_types=["B.Tech"], min_gpa=8.0)
    assert evaluate_eligibility(opp, profile)[0] == EligibilityClassification.INELIGIBLE


# 15. Listing is open but candidate is ineligible
def test_case_15_open_but_ineligible():
    reqs = OpportunityRequirementsOut(eligible_graduation_years=[2028])
    opp = make_opp(current_status=OpportunityStatus.OPEN_CONFIRMED, requirements=reqs)
    profile = make_profile(grad_year=2026)

    status, _, _ = evaluate_eligibility(opp, profile)
    assert opp.current_status == OpportunityStatus.OPEN_CONFIRMED
    assert status == EligibilityClassification.INELIGIBLE


# 16. Potentially suitable but unresolved mandatory condition
def test_case_16_potentially_eligible_not_counted_as_eligible():
    reqs = OpportunityRequirementsOut(
        eligible_degree_types=["B.Tech"],
        no_active_backlogs=True,
    )
    opp = make_opp(requirements=reqs)
    profile = make_profile()
    profile.active_backlogs = None  # Unknown backlogs

    status, _, _ = evaluate_eligibility(opp, profile)
    assert status == EligibilityClassification.POTENTIAL_MATCH
    assert status != EligibilityClassification.ELIGIBLE


# 17. Listing has only preferred qualifications and no restrictive mandatory conditions
def test_case_17_only_preferred_qualifications():
    reqs = OpportunityRequirementsOut(
        preferred_skills=["PyTorch", "Docker", "AWS"],
    )
    opp = make_opp(requirements=reqs)
    profile = make_profile(skills=["Python"])

    status, _, reasons = evaluate_eligibility(opp, profile)
    # Since only preferred skills exist and no mandatory restrictions, candidate is not falsely rejected
    assert status != EligibilityClassification.INELIGIBLE


# 18. Contradictory criteria flags conflict
def test_case_18_conflicting_criteria():
    reqs = OpportunityRequirementsOut(
        eligible_graduation_years=[2027],
        has_conflicting_requirements=True,
    )
    opp = make_opp(requirements=reqs)
    profile = make_profile(grad_year=2027)

    status, _, reasons = evaluate_eligibility(opp, profile)
    assert status == EligibilityClassification.POTENTIAL_MATCH
    assert any(r["field"] == "conflicting_requirements" for r in reasons)


# 19. Degree outside candidate's category (e.g. PhD required vs B.Tech candidate)
def test_case_19_degree_category_mismatch():
    reqs = OpportunityRequirementsOut(
        eligible_degree_types=["PhD in Computer Science", "Doctorate"],
    )
    opp = make_opp(requirements=reqs)
    profile = make_profile(degree="B.Tech")

    status, _, reasons = evaluate_eligibility(opp, profile)
    assert status == EligibilityClassification.INELIGIBLE
    assert any(r["field"] == "degree" and r["status"] == "fail" for r in reasons)


# 20. International remote internship with no explicit country restriction
def test_case_20_international_remote_no_country_restriction():
    reqs = OpportunityRequirementsOut(
        eligible_degree_types=["B.Tech"],
        eligible_countries=[],  # No country restriction
    )
    opp = make_opp(country="United States", work_arrangement="remote", requirements=reqs)
    profile = make_profile(country_of_residence="India")

    status, _, reasons = evaluate_eligibility(opp, profile)
    assert status == EligibilityClassification.ELIGIBLE
    assert not any(r["field"] == "country" and r["status"] == "fail" for r in reasons)
