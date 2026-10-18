"""
Compass — Career Copilot Domain Models.

Defines schemas for Resume Studio (master resumes, tailored variants, factual validation)
and Application Center (application states, batch review, explicit approval, submission results).
"""
from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator

from backend.models_radar import OpportunityOut


class ResumeValidationStatus(str, Enum):
    DRAFT = "DRAFT"
    VALIDATION_FAILED = "VALIDATION_FAILED"
    NEEDS_USER_INPUT = "NEEDS_USER_INPUT"
    READY_FOR_REVIEW = "READY_FOR_REVIEW"
    APPROVED = "APPROVED"


class CareerApplicationStatus(str, Enum):
    SAVED = "SAVED"
    DISCOVERED = "DISCOVERED"
    ELIGIBILITY_CHECKED = "ELIGIBILITY_CHECKED"
    PREPARING = "PREPARING"
    ELIGIBILITY_REVIEW = "ELIGIBILITY_REVIEW"
    NEEDS_INFORMATION = "NEEDS_INFORMATION"
    RESUME_DRAFT = "RESUME_DRAFT"
    RESUME_VALIDATION_FAILED = "RESUME_VALIDATION_FAILED"
    READY_FOR_REVIEW = "READY_FOR_REVIEW"
    READY_FOR_APPROVAL = "READY_FOR_APPROVAL"
    APPROVED_FOR_SUBMISSION = "APPROVED_FOR_SUBMISSION"
    SUBMITTING = "SUBMITTING"
    SUBMITTED = "SUBMITTED"
    SUBMISSION_FAILED = "SUBMISSION_FAILED"
    SUBMISSION_OUTCOME_UNKNOWN = "SUBMISSION_OUTCOME_UNKNOWN"
    MANUAL_SUBMISSION_REQUIRED = "MANUAL_SUBMISSION_REQUIRED"
    ASSESSMENT_RECEIVED = "ASSESSMENT_RECEIVED"
    INTERVIEW = "INTERVIEW"
    REJECTED = "REJECTED"
    OFFER_RECEIVED = "OFFER_RECEIVED"
    WITHDRAWN = "WITHDRAWN"
    CLOSED = "CLOSED"


class SubmissionMethod(str, Enum):
    OFFICIAL_API = "official_api"
    ATS_ENDPOINT = "ats_endpoint"
    BROWSER_ASSISTED = "browser_assisted"
    MANUAL_HANDOFF = "manual_handoff"


class ResumeEducationItem(BaseModel):
    institution: str
    degree: str
    field_of_study: Optional[str] = None
    start_year: Optional[int] = None
    end_year: Optional[int] = None
    cgpa_or_grade: Optional[str] = None


class ResumeProjectItem(BaseModel):
    title: str
    description: str
    technologies: List[str] = Field(default_factory=list)
    project_url: Optional[str] = None
    highlights: List[str] = Field(default_factory=list)


class ResumeExperienceItem(BaseModel):
    company: str
    role_title: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_current: bool = False
    highlights: List[str] = Field(default_factory=list)


class ResumeContent(BaseModel):
    full_name: str = ""
    email: str = ""
    phone: Optional[str] = None
    location: Optional[str] = None
    github_or_portfolio: Optional[str] = None
    linkedin_url: Optional[str] = None
    summary: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    education: List[ResumeEducationItem] = Field(default_factory=list)
    projects: List[ResumeProjectItem] = Field(default_factory=list)
    experience: List[ResumeExperienceItem] = Field(default_factory=list)
    achievements: List[str] = Field(default_factory=list)
    certifications: List[str] = Field(default_factory=list)


class ResumeValidationReport(BaseModel):
    is_valid: bool = True
    passed_checks: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    unsupported_claims: List[str] = Field(default_factory=list)
    missing_fields: List[str] = Field(default_factory=list)
    tailored_alignments: List[str] = Field(default_factory=list)
    diff_summary: Dict[str, Any] = Field(default_factory=dict)


class ResumeOut(BaseModel):
    id: int
    user_id: str
    opportunity_id: Optional[int] = None
    is_master: bool = False
    title: str
    version: int = 1
    content: ResumeContent
    cover_letter: Optional[str] = None
    validation_status: ResumeValidationStatus = ResumeValidationStatus.DRAFT
    validation_report: ResumeValidationReport = Field(default_factory=ResumeValidationReport)
    is_persisted: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class TailorResumeRequest(BaseModel):
    opportunity_id: int
    custom_title: Optional[str] = None
    target_skills_emphasis: Optional[List[str]] = None


class SaveResumeRequest(BaseModel):
    title: str
    content: ResumeContent
    cover_letter: Optional[str] = None
    opportunity_id: Optional[int] = None
    is_master: bool = False


class ResumeParseUploadRequest(BaseModel):
    raw_text: str


class CoverLetterOut(BaseModel):
    id: Optional[int] = None
    opportunity_id: int
    company_name: str
    role_title: str
    content: str
    verified_projects_referenced: List[str] = Field(default_factory=list)
    verified_skills_referenced: List[str] = Field(default_factory=list)
    created_at: Optional[datetime] = None


class DraftCoverLetterRequest(BaseModel):
    opportunity_id: int
    emphasis_projects: Optional[List[str]] = None
    tone: Optional[str] = "professional"


class CareerApplicationOut(BaseModel):
    id: int
    user_id: str
    opportunity_id: int
    opportunity: Optional[OpportunityOut] = None
    resume_id: Optional[int] = None
    resume: Optional[ResumeOut] = None
    cover_letter: Optional[str] = None
    missing_fields: List[str] = Field(default_factory=list)
    status: CareerApplicationStatus = CareerApplicationStatus.SAVED
    submission_method: SubmissionMethod = SubmissionMethod.MANUAL_HANDOFF
    form_answers: Dict[str, Any] = Field(default_factory=dict)
    submission_payload: Dict[str, Any] = Field(default_factory=dict)
    submission_result: Dict[str, Any] = Field(default_factory=dict)
    batch_id: Optional[str] = None
    approved_at: Optional[datetime] = None
    submitted_at: Optional[datetime] = None
    target_deadline: Optional[date] = None
    private_notes: Optional[str] = None
    is_persisted: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UpdateApplicationStatusRequest(BaseModel):
    status: Optional[CareerApplicationStatus] = None
    submission_method: Optional[SubmissionMethod] = None
    form_answers: Optional[Dict[str, Any]] = None
    cover_letter: Optional[str] = None
    target_deadline: Optional[date] = None
    private_notes: Optional[str] = None

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, v: Any) -> Any:
        if isinstance(v, str):
            val_upper = v.upper()
            try:
                return CareerApplicationStatus(val_upper)
            except ValueError:
                return v
        return v


class BatchPrepareRequest(BaseModel):
    opportunity_ids: List[int]


class BatchReviewOut(BaseModel):
    batch_id: str
    applications: List[CareerApplicationOut]
    total_count: int
    ready_count: int
    blocked_count: int
    status: str = "DRAFT"
    approval_token: Optional[str] = None
    is_persisted: bool = True
    created_at: datetime


class BatchApproveRequest(BaseModel):
    batch_id: str
    attestation_confirmed: bool = False
    work_auth_confirmed: bool = False
    legal_statements_accepted: bool = False


class BatchSubmitRequest(BaseModel):
    batch_id: str
    preferred_method: Optional[SubmissionMethod] = None
    approval_token: Optional[str] = None


class SubmissionResultItem(BaseModel):
    application_id: int
    company_name: str
    role_title: str
    status: str
    submission_method: str
    reference_id: Optional[str] = None
    message: str
    manual_package: Optional[Dict[str, Any]] = None


class BatchSubmitResultOut(BaseModel):
    batch_id: str
    total_processed: int
    successful_count: int
    manual_count: int
    failed_count: int
    uncertain_count: int = 0
    results: List[SubmissionResultItem]


class SubmissionAdapterCapability(BaseModel):
    adapter_id: str
    display_name: str
    description: str
    is_automated: bool
    requires_credentials: bool
    is_configured: bool
    supported_platforms: List[str]
