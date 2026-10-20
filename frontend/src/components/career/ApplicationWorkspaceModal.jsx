import React, { useState, useEffect, useCallback } from 'react'
import {
  prepareApplication,
  fetchResume,
  updateResume,
  tailorResume,
  draftCoverLetter,
  setApplicationCoverLetter,
  updateApplication,
  getResumeExportUrl,
  getResumeExportDocxUrl,
  fetchJobAnalysis,
} from '../../api/careerApi'
import {
  loadWorkspaceDraft,
  saveWorkspaceDraft,
  clearWorkspaceDraft,
  inspectDraftConflict,
} from '../../utils/workspaceDraft'
import ValidationReportCard from './ValidationReportCard'

export default function ApplicationWorkspaceModal({
  opportunity,
  onClose,
  onApplicationUpdated,
}) {
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'resume' | 'cover_letter' | 'checklist' | 'handoff'
  const [application, setApplication] = useState(null)
  const [resume, setResume] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tailoring, setTailoring] = useState(false)
  const [savingResume, setSavingResume] = useState(false)
  const [draftingLetter, setDraftingLetter] = useState(false)
  const [savingLetter, setSavingLetter] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
  const [error, setError] = useState(null)
  const [notification, setNotification] = useState(null)

  // Resume form state
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [location, setLocation] = useState('')
  const [summary, setSummary] = useState('')
  const [skillsText, setSkillsText] = useState('')
  const [resumeTemplate, setResumeTemplate] = useState('ats_classic') // 'ats_classic' | 'modern' | 'minimal'

  // Cover Letter & Notes state
  const [coverLetterText, setCoverLetterText] = useState('')
  const [appStatus, setAppStatus] = useState('preparing')
  const [privateNotes, setPrivateNotes] = useState('')
  const [targetDeadline, setTargetDeadline] = useState('')

  // Draft recovery state
  const [draftConflict, setDraftConflict] = useState(null)
  const [isInitialLoaded, setIsInitialLoaded] = useState(false)

  // Job Requirement Analysis state (Phase 5 & 8)
  const [jobAnalysis, setJobAnalysis] = useState(null)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [customJobDesc, setCustomJobDesc] = useState(opportunity?.description || '')

  // Preparation Checklist state (stored in application metadata / notes or locally)
  const [checklist, setChecklist] = useState({
    resumeTailored: false,
    resumeDownloaded: false,
    coverLetterDrafted: false,
    questionsReviewed: false,
    submittedExternally: false,
  })

  // Load deep job requirement analysis
  const loadJobAnalysisData = useCallback(async (customDesc = null) => {
    if (!opportunity?.id) return
    setLoadingAnalysis(true)
    try {
      const report = await fetchJobAnalysis(opportunity.id, customDesc)
      setJobAnalysis(report)
    } catch (err) {
      console.warn('Could not load detailed job analysis:', err)
    } finally {
      setLoadingAnalysis(false)
    }
  }, [opportunity?.id])

  // Load or auto-prepare application on mount
  const loadWorkspaceData = useCallback(async () => {
    if (!opportunity?.id) return
    setLoading(true)
    setError(null)
    try {
      const app = await prepareApplication(opportunity.id)
      setApplication(app)
      setAppStatus(app.status || 'preparing')
      setPrivateNotes(app.private_notes || '')
      setTargetDeadline(app.target_deadline || '')
      setCoverLetterText(app.cover_letter || '')

      let currentResume = null
      if (app.resume_id) {
        currentResume = await fetchResume(app.resume_id)
        setResume(currentResume)
        populateResumeForm(currentResume)
        setChecklist(prev => ({
          ...prev,
          resumeTailored: true,
          coverLetterDrafted: Boolean(app.cover_letter),
          submittedExternally: app.status === 'submitted',
        }))
      }

      // Check for local unsaved draft
      const storedDraft = loadWorkspaceDraft(opportunity.id)
      if (storedDraft) {
        const conflict = inspectDraftConflict(storedDraft, currentResume, app)
        if (conflict.hasConflict) {
          setDraftConflict(conflict)
        }
      }
      setIsInitialLoaded(true)
      loadJobAnalysisData()
    } catch (err) {
      console.error('Error loading application workspace:', err)
      setError(err.message || 'Failed to prepare application workspace.')
    } finally {
      setLoading(false)
    }
  }, [opportunity?.id, loadJobAnalysisData])

  useEffect(() => {
    loadWorkspaceData()
  }, [loadWorkspaceData])

  // Restore unsaved local draft edits
  const handleRestoreDraft = () => {
    if (!draftConflict?.draftRecord?.draft) return
    const d = draftConflict.draftRecord.draft
    if (d.fullName !== undefined) setFullName(d.fullName)
    if (d.email !== undefined) setEmail(d.email)
    if (d.phone !== undefined) setPhone(d.phone)
    if (d.location !== undefined) setLocation(d.location)
    if (d.summary !== undefined) setSummary(d.summary)
    if (d.skillsText !== undefined) setSkillsText(d.skillsText)
    if (d.resumeTemplate) setResumeTemplate(d.resumeTemplate)
    if (d.coverLetterText !== undefined) setCoverLetterText(d.coverLetterText)
    if (d.privateNotes !== undefined) setPrivateNotes(d.privateNotes)
    if (d.targetDeadline !== undefined) setTargetDeadline(d.targetDeadline)
    setDraftConflict(null)
    showNotification('Restored unsaved local draft edits!')
  }

  // Discard local draft and preserve server state
  const handleDiscardDraft = () => {
    clearWorkspaceDraft(opportunity?.id)
    setDraftConflict(null)
    showNotification('Discarded local draft.')
  }

  // Debounced auto-save to local draft
  useEffect(() => {
    if (!isInitialLoaded || !opportunity?.id || draftConflict) return

    const timer = setTimeout(() => {
      saveWorkspaceDraft(opportunity.id, {
        fullName,
        email,
        phone,
        location,
        summary,
        skillsText,
        resumeTemplate,
        coverLetterText,
        privateNotes,
        targetDeadline,
        baseResumeId: resume?.id,
        baseResumeUpdatedAt: resume?.updated_at,
        baseAppUpdatedAt: application?.updated_at,
      })
    }, 600)

    return () => clearTimeout(timer)
  }, [
    isInitialLoaded,
    opportunity?.id,
    fullName,
    email,
    phone,
    location,
    summary,
    skillsText,
    resumeTemplate,
    coverLetterText,
    privateNotes,
    targetDeadline,
    resume?.id,
    resume?.updated_at,
    application?.updated_at,
    draftConflict,
  ])

  const populateResumeForm = (res) => {
    if (!res || !res.content) return
    const c = res.content
    setFullName(c.full_name || '')
    setEmail(c.email || '')
    setPhone(c.phone || '')
    setLocation(c.location || '')
    setSummary(c.summary || '')
    setSkillsText((c.skills || []).join(', '))
  }

  const showNotification = (msg, type = 'success') => {
    setNotification({ message: msg, type })
    setTimeout(() => {
      setNotification(prev => (prev?.message === msg ? null : prev))
    }, 3500)
  }

  // Handle AI Resume Tailoring (strictly truthful, preserves master)
  const handleTriggerTailor = async () => {
    setTailoring(true)
    setError(null)
    try {
      const tailored = await tailorResume(opportunity.id)
      setResume(tailored)
      populateResumeForm(tailored)
      if (application) {
        setApplication(prev => ({ ...prev, resume_id: tailored.id, resume: tailored }))
      }
      setChecklist(prev => ({ ...prev, resumeTailored: true }))
      showNotification('Tailored resume snapshot created and validated against your master profile!')
    } catch (err) {
      setError(err.message || 'Failed to tailor resume')
    } finally {
      setTailoring(false)
    }
  }

  // Handle saving inline edits to tailored resume
  const handleSaveResumeEdits = async () => {
    if (!resume) return
    setSavingResume(true)
    setError(null)
    try {
      const skillsArr = skillsText.split(',').map(s => s.trim()).filter(Boolean)
      const updatedContent = {
        ...(resume.content || {}),
        full_name: fullName,
        email,
        phone,
        location,
        summary,
        skills: skillsArr,
      }
      const updated = await updateResume(resume.id, {
        title: resume.title || `${opportunity.company_name} Tailored Resume`,
        content: updatedContent,
      })
      setResume(updated)
      clearWorkspaceDraft(opportunity.id)
      showNotification('Resume updates saved and factual validation re-evaluated.')
    } catch (err) {
      setError(err.message || 'Failed to save resume edits')
    } finally {
      setSavingResume(false)
    }
  }

  // Handle Cover Letter Generation
  const handleGenerateCoverLetter = async () => {
    setDraftingLetter(true)
    setError(null)
    try {
      const res = await draftCoverLetter(opportunity.id)
      setCoverLetterText(res.content)
      if (application) {
        await setApplicationCoverLetter(application.id, res.content)
      }
      setChecklist(prev => ({ ...prev, coverLetterDrafted: true }))
      showNotification('Truthful cover letter generated from your verified projects and skills!')
    } catch (err) {
      setError(err.message || 'Failed to generate cover letter')
    } finally {
      setDraftingLetter(false)
    }
  }

  // Handle Saving Cover Letter
  const handleSaveCoverLetter = async () => {
    if (!application) return
    setSavingLetter(true)
    setError(null)
    try {
      await setApplicationCoverLetter(application.id, coverLetterText)
      clearWorkspaceDraft(opportunity.id)
      setChecklist(prev => ({ ...prev, coverLetterDrafted: Boolean(coverLetterText) }))
      showNotification('Cover letter saved to application record.')
    } catch (err) {
      setError(err.message || 'Failed to save cover letter')
    } finally {
      setSavingLetter(false)
    }
  }

  // Handle Status & Notes Updates
  const handleUpdateApplicationRecord = async (newStatus = appStatus) => {
    if (!application) return
    setSavingStatus(true)
    setError(null)
    try {
      const updated = await updateApplication(application.id, {
        status: newStatus,
        private_notes: privateNotes || null,
        target_deadline: targetDeadline || null,
      })
      setApplication(updated)
      setAppStatus(updated.status)
      clearWorkspaceDraft(opportunity.id)
      if (onApplicationUpdated) onApplicationUpdated(updated)
      showNotification(`Application updated: Status is now "${newStatus.toUpperCase()}"`)
    } catch (err) {
      setError(err.message || 'Failed to update application status')
    } finally {
      setSavingStatus(false)
    }
  }

  // Handle External Submission Confirmation
  const handleConfirmExternalSubmission = async () => {
    await handleUpdateApplicationRecord('submitted')
    setChecklist(prev => ({ ...prev, submittedExternally: true }))
    showNotification('Confirmed: Marked as submitted on employer portal.')
  }

  // Compute Match Analysis
  const requiredSkills = opportunity?.requirements?.required_skills || []
  const userSkills = resume?.content?.skills || []
  const matchedSkills = requiredSkills.filter(s =>
    userSkills.some(us => us.toLowerCase() === s.toLowerCase())
  )
  const missingSkills = requiredSkills.filter(s =>
    !userSkills.some(us => us.toLowerCase() === s.toLowerCase())
  )

  const TABS = [
    { key: 'overview', icon: '📋', label: 'Role & Match' },
    { key: 'job_analysis', icon: '🎯', label: 'Job Analysis' },
    { key: 'resume', icon: '📄', label: 'Tailored Resume' },
    { key: 'cover_letter', icon: '✍️', label: 'Cover Letter' },
    { key: 'checklist', icon: '✅', label: 'Checklist & Notes' },
    { key: 'handoff', icon: '🚀', label: 'Official Submission' },
  ]

  return (
    <div
      id="application-workspace-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box',
      }}
    >
      <div
        id="application-workspace-modal"
        style={{
          width: '100%',
          maxWidth: '920px',
          maxHeight: '92vh',
          background: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* Workspace Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '16px',
            background: 'var(--bg-app)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: 'var(--brand)',
                  color: '#ffffff',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Application Workspace
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: appStatus === 'submitted' ? '#dcfce7' : '#e0f2fe',
                  color: appStatus === 'submitted' ? '#166534' : '#0369a1',
                  textTransform: 'uppercase',
                }}
              >
                Status: {appStatus}
              </span>
            </div>
            <h2 style={{ margin: '6px 0 2px 0', fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>
              {opportunity.role_title}
            </h2>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <span>🏢 <strong>{opportunity.company_name}</strong></span>
              <span>📍 {opportunity.location || 'Remote / Flexible'}</span>
              <span>💼 {opportunity.work_arrangement}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Application Workspace"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '22px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Workspace Notifications */}
        {notification && (
          <div
            style={{
              padding: '10px 20px',
              background: notification.type === 'success' ? '#f0fdf4' : '#eff6ff',
              color: notification.type === 'success' ? '#166534' : '#1d4ed8',
              borderBottom: '1px solid var(--border)',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>{notification.type === 'success' ? '✓' : 'ℹ️'}</span>
            <span>{notification.message}</span>
          </div>
        )}

        {/* Global Error Banner */}
        {error && (
          <div
            style={{
              padding: '10px 20px',
              background: '#fef2f2',
              color: '#991b1b',
              borderBottom: '1px solid #fecaca',
              fontSize: '13px',
            }}
          >
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Workspace Nav Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '8px 20px',
            background: 'var(--bg-card)',
            borderBottom: '1px solid var(--border)',
            overflowX: 'auto',
          }}
        >
          {TABS.map(tab => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: '7px',
                  border: isActive ? '1px solid var(--brand)' : '1px solid transparent',
                  background: isActive ? 'var(--brand)' : 'transparent',
                  color: isActive ? '#ffffff' : 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Main Content Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
              <div>Initializing application workspace and tailored resume snapshot…</div>
            </div>
          ) : (
            <>
              {/* Draft Recovery Banner */}
              {draftConflict && (
                <div
                  id="draft-conflict-banner"
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: draftConflict.type === 'server_newer' ? '#fffbeb' : '#eff6ff',
                    border: draftConflict.type === 'server_newer' ? '1px solid #fcd34d' : '1px solid #bfdbfe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    flexWrap: 'wrap',
                    marginBottom: '16px',
                  }}
                >
                  <div style={{ fontSize: '13px', color: draftConflict.type === 'server_newer' ? '#92400e' : '#1e40af', lineHeight: 1.4 }}>
                    {draftConflict.type === 'server_newer' ? (
                      <span>
                        ⚠️ <strong>Server has newer updates</strong>, but you also have an unsaved local draft ({new Date(draftConflict.draftUpdatedAt).toLocaleTimeString()}).
                      </span>
                    ) : (
                      <span>
                        💾 <strong>Unsaved local draft found</strong> ({new Date(draftConflict.draftUpdatedAt).toLocaleTimeString()}). Would you like to restore your edits?
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      id="restore-draft-btn"
                      onClick={handleRestoreDraft}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '6px',
                        background: 'var(--brand)',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Restore Draft
                    </button>
                    <button
                      type="button"
                      id="discard-draft-btn"
                      onClick={handleDiscardDraft}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '6px',
                        background: 'transparent',
                        color: 'var(--text-muted)',
                        border: '1px solid var(--border)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Discard
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 1: Role Overview & Deterministic Match Analysis */}
              {activeTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div
                    style={{
                      padding: '14px 18px',
                      borderRadius: '10px',
                      background: 'var(--bg-app)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Role Description & Verified Requirements
                    </h3>
                    <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {opportunity.description || 'Verified opportunity description is retrieved directly from official career postings.'}
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {requiredSkills.map((sk, idx) => (
                        <span
                          key={idx}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                          }}
                        >
                          {sk}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Factual Integrity & Match Analysis Card */}
                  <div
                    style={{
                      padding: '16px 18px',
                      borderRadius: '10px',
                      background: 'var(--bg-app)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        🎯 Factual Match Analysis
                      </h3>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Calculated deterministically from verified profile background
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                      <div style={{ padding: '12px', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                        <div style={{ fontWeight: 700, fontSize: '12px', color: '#166534', marginBottom: '6px' }}>
                          ✓ Verified Matching Skills ({matchedSkills.length})
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {matchedSkills.length > 0 ? (
                            matchedSkills.map((sk, i) => (
                              <span key={i} style={{ background: '#ffffff', color: '#15803d', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, border: '1px solid #bbf7d0' }}>
                                {sk}
                              </span>
                            ))
                          ) : (
                            <span style={{ fontSize: '12px', color: '#166534' }}>Add relevant skills to your profile to match.</span>
                          )}
                        </div>
                      </div>

                      <div style={{ padding: '12px', borderRadius: '8px', background: '#fffbeb', border: '1px solid #fde68a' }}>
                        <div style={{ fontWeight: 700, fontSize: '12px', color: '#b45309', marginBottom: '6px' }}>
                          ⚠️ Unverified or Missing Skills ({missingSkills.length})
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {missingSkills.length > 0 ? (
                            missingSkills.map((sk, i) => (
                              <span key={i} style={{ background: '#ffffff', color: '#b45309', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, border: '1px solid #fde68a' }}>
                                {sk}
                              </span>
                            ))
                          ) : (
                            <span style={{ fontSize: '12px', color: '#b45309' }}>All role requirements verified!</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: '14px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>🛡️ <strong>Zero Hallucination Guarantee:</strong> Tailored resumes strictly derived from verified profile background.</span>
                      <button
                        type="button"
                        onClick={() => setActiveTab('job_analysis')}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: 'transparent',
                          border: '1px solid var(--border)',
                          color: 'var(--brand)',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Deep Requirement Breakdown →
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: Deep Job Description Analysis & Evidence Match (Phase 5) */}
              {activeTab === 'job_analysis' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {/* Top Match Score & Verdict Card */}
                  <div
                    style={{
                      padding: '18px 20px',
                      borderRadius: '12px',
                      background: 'var(--bg-app)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '16px',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Deterministic Requirement Alignment
                      </div>
                      <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {opportunity.role_title} @ {opportunity.company_name}
                      </h3>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '600px', lineHeight: 1.5 }}>
                        {jobAnalysis?.summary_verdict || (loadingAnalysis ? 'Analyzing requirements against candidate master profile…' : 'Requirement analysis ready.')}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: '12px 20px',
                        borderRadius: '10px',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '26px',
                          fontWeight: 800,
                          color: (jobAnalysis?.match_score || 0) >= 0.75 ? '#16a34a' : (jobAnalysis?.match_score || 0) >= 0.5 ? '#d97706' : '#dc2626',
                        }}
                      >
                        {loadingAnalysis ? '…' : `${Math.round((jobAnalysis?.match_score || 0) * 100)}%`}
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Match Score
                      </div>
                    </div>
                  </div>

                  {/* Missing Critical Skills Alert */}
                  {jobAnalysis?.missing_critical_skills && jobAnalysis.missing_critical_skills.length > 0 && (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: '8px',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                      }}
                    >
                      <span style={{ fontSize: '18px' }}>⚠️</span>
                      <div style={{ fontSize: '13px', color: '#991b1b', lineHeight: 1.4 }}>
                        <strong>Missing Mandatory Qualifications:</strong>{' '}
                        {jobAnalysis.missing_critical_skills.join(', ')}. If you possess these, update your master profile before submitting.
                      </div>
                    </div>
                  )}

                  {/* Job Description Fine-Tuner */}
                  <div
                    style={{
                      padding: '14px 18px',
                      borderRadius: '10px',
                      background: 'var(--bg-app)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Detailed Job Description (Editable for custom postings)
                      </span>
                      <button
                        type="button"
                        onClick={() => loadJobAnalysisData(customJobDesc)}
                        disabled={loadingAnalysis}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '6px',
                          background: 'var(--brand)',
                          color: '#ffffff',
                          border: 'none',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: loadingAnalysis ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {loadingAnalysis ? 'Analyzing…' : '🔄 Re-Analyze Alignment'}
                      </button>
                    </div>
                    <textarea
                      rows={4}
                      value={customJobDesc}
                      onChange={e => setCustomJobDesc(e.target.value)}
                      placeholder="Paste complete job description or eligibility requirements here to re-evaluate…"
                      style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-card)',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        boxSizing: 'border-box',
                        resize: 'vertical',
                      }}
                    />
                  </div>

                  {/* Detailed Evidence Match Grid */}
                  <div
                    style={{
                      padding: '16px 18px',
                      borderRadius: '10px',
                      background: 'var(--bg-app)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Requirement-by-Requirement Evidence Traceability
                    </h4>

                    {jobAnalysis?.matches && jobAnalysis.matches.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {jobAnalysis.matches.map((m, idx) => {
                          const statusConfig = {
                            supported: { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0', icon: '✓', label: 'Supported' },
                            partial: { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe', icon: '~', label: 'Partial Match' },
                            missing_evidence: { bg: '#fffbeb', text: '#92400e', border: '#fde68a', icon: '?', label: 'Missing Evidence' },
                            gap: { bg: '#fef2f2', text: '#991b1b', border: '#fecaca', icon: '✗', label: 'Requirement Gap' },
                          }[m.match_status] || { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', icon: '•', label: m.match_status }

                          return (
                            <div
                              key={idx}
                              style={{
                                padding: '12px 14px',
                                borderRadius: '8px',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span
                                    style={{
                                      padding: '2px 8px',
                                      borderRadius: '4px',
                                      fontSize: '10px',
                                      fontWeight: 800,
                                      textTransform: 'uppercase',
                                      background: statusConfig.bg,
                                      color: statusConfig.text,
                                      border: `1px solid ${statusConfig.border}`,
                                    }}
                                  >
                                    {statusConfig.icon} {statusConfig.label}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: '10px',
                                      fontWeight: 700,
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      background: m.is_mandatory ? '#fee2e2' : '#f1f5f9',
                                      color: m.is_mandatory ? '#991b1b' : '#475569',
                                      textTransform: 'uppercase',
                                    }}
                                  >
                                    {m.is_mandatory ? 'Mandatory' : 'Preferred'} {m.category}
                                  </span>
                                </div>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  Confidence: {Math.round(m.confidence * 100)}%
                                </span>
                              </div>

                              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {m.requirement}
                              </div>

                              {m.supporting_facts && m.supporting_facts.length > 0 && (
                                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-app)', padding: '6px 10px', borderRadius: '6px' }}>
                                  <strong>Verified Profile Evidence:</strong> {m.supporting_facts.join(' • ')}
                                </div>
                              )}

                              {m.reasoning && (
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                  {m.reasoning}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                        {loadingAnalysis ? 'Extracting mandatory and preferred criteria…' : 'No requirements parsed. Paste detailed job description above.'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: Tailored Resume Studio & ATS Preview */}
              {activeTab === 'resume' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {resume?.title || 'Tailored Application Resume'}
                      </h3>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Snapshot isolated for {opportunity.company_name}. Master resume remains unchanged.
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={handleTriggerTailor}
                        disabled={tailoring}
                        style={{
                          padding: '7px 14px',
                          borderRadius: '8px',
                          background: 'var(--bg-app)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-primary)',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: tailoring ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {tailoring ? 'Tailoring with AI…' : '✨ Re-Tailor with AI'}
                      </button>
                      {resume?.id && (
                        <>
                          <a
                            href={getResumeExportDocxUrl(resume.id)}
                            download
                            onClick={() => {
                              setChecklist(prev => ({ ...prev, resumeDownloaded: true }))
                              showNotification('Downloading clean ATS Word (.docx) document.')
                            }}
                            style={{
                              padding: '7px 14px',
                              borderRadius: '8px',
                              background: 'var(--bg-app)',
                              border: '1px solid var(--border)',
                              color: 'var(--text-primary)',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            📥 Export Word (.docx)
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              window.open(getResumeExportUrl(resume.id, resumeTemplate), '_blank')
                              setChecklist(prev => ({ ...prev, resumeDownloaded: true }))
                              showNotification('Opened ATS-compliant printable resume for PDF export.')
                            }}
                            style={{
                              padding: '7px 14px',
                              borderRadius: '8px',
                              background: 'var(--brand)',
                              color: '#ffffff',
                              border: 'none',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            📄 Export ATS Resume (Print/PDF)
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Factual Integrity Audit Card */}
                  {resume?.validation_report && (
                    <ValidationReportCard validationReport={resume.validation_report} />
                  )}

                  {/* Template Style Selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-app)', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>ATS Template Style:</span>
                    {[
                      { id: 'ats_classic', label: 'ATS Classic' },
                      { id: 'modern', label: 'Modern Clean' },
                      { id: 'minimal', label: 'Minimalist' },
                    ].map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setResumeTemplate(t.id)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: resumeTemplate === t.id ? '1px solid var(--brand)' : '1px solid var(--border)',
                          background: resumeTemplate === t.id ? 'var(--brand)' : 'var(--bg-card)',
                          color: resumeTemplate === t.id ? '#ffffff' : 'var(--text-primary)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* In-line Resume Fine-Tuner */}
                  <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--bg-app)', border: '1px solid var(--border)' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Fine-Tune Tailored Resume Details
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Full Name</label>
                        <input
                          type="text"
                          value={fullName}
                          onChange={e => setFullName(e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Email</label>
                        <input
                          type="email"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Phone</label>
                        <input
                          type="text"
                          value={phone}
                          onChange={e => setPhone(e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Location</label>
                        <input
                          type="text"
                          value={location}
                          onChange={e => setLocation(e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Professional Summary</label>
                      <textarea
                        rows={3}
                        value={summary}
                        onChange={e => setSummary(e.target.value)}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Skills (comma separated)</label>
                      <input
                        type="text"
                        value={skillsText}
                        onChange={e => setSkillsText(e.target.value)}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveResumeEdits}
                      disabled={savingResume}
                      style={{
                        padding: '8px 18px',
                        borderRadius: '7px',
                        background: 'var(--brand)',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: savingResume ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {savingResume ? 'Saving…' : 'Save Resume Updates'}
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 3: Truthful Cover Letter Generator & Editor */}
              {activeTab === 'cover_letter' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Tailored Cover Letter
                      </h3>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Crafted specifically for {opportunity.company_name} using your verified projects.
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={handleGenerateCoverLetter}
                        disabled={draftingLetter}
                        style={{
                          padding: '7px 14px',
                          borderRadius: '8px',
                          background: 'var(--bg-app)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-primary)',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: draftingLetter ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {draftingLetter ? 'Generating…' : '✨ Generate with AI'}
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveCoverLetter}
                        disabled={savingLetter}
                        style={{
                          padding: '7px 14px',
                          borderRadius: '8px',
                          background: 'var(--brand)',
                          color: '#ffffff',
                          border: 'none',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: savingLetter ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {savingLetter ? 'Saving…' : 'Save Letter'}
                      </button>
                    </div>
                  </div>

                  <textarea
                    rows={12}
                    value={coverLetterText}
                    onChange={e => setCoverLetterText(e.target.value)}
                    placeholder="Click 'Generate with AI' to draft a truthful cover letter from your verified background..."
                    style={{
                      width: '100%',
                      padding: '14px',
                      borderRadius: '10px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-app)',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      lineHeight: 1.6,
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
              )}

              {/* TAB 4: Checklist & Status Tracker */}
              {activeTab === 'checklist' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Preparation Checklist */}
                  <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--bg-app)', border: '1px solid var(--border)' }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Application Preparation Checklist
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {[
                        { key: 'resumeTailored', label: 'Tailored resume generated & verified against master' },
                        { key: 'resumeDownloaded', label: 'ATS-formatted resume PDF previewed / downloaded' },
                        { key: 'coverLetterDrafted', label: 'Personalized cover letter reviewed & saved' },
                        { key: 'questionsReviewed', label: 'Required qualifications & application answers reviewed' },
                        { key: 'submittedExternally', label: 'Submitted on official employer portal (if required)' },
                      ].map(item => (
                        <label
                          key={item.key}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            fontSize: '13px',
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(checklist[item.key])}
                            onChange={e => setChecklist(prev => ({ ...prev, [item.key]: e.target.checked }))}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Status Tracker & Notes */}
                  <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--bg-app)', border: '1px solid var(--border)' }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Track Application Status & Deadlines
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '14px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Pipeline Status</label>
                        <select
                          value={appStatus}
                          onChange={e => setAppStatus(e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px' }}
                        >
                          <option value="interested">Interested</option>
                          <option value="preparing">Preparing</option>
                          <option value="ready_for_review">Ready for Review</option>
                          <option value="submitted">Applied / Submitted Externally</option>
                          <option value="interviewing">Interviewing</option>
                          <option value="offer_received">Offer Received</option>
                          <option value="rejected">Rejected</option>
                          <option value="withdrawn">Withdrawn</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Personal Target Deadline</label>
                        <input
                          type="date"
                          value={targetDeadline}
                          onChange={e => setTargetDeadline(e.target.value)}
                          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Private Candidate Notes</label>
                      <textarea
                        rows={3}
                        value={privateNotes}
                        onChange={e => setPrivateNotes(e.target.value)}
                        placeholder="Add personal interview dates, recruiter contacts, or application notes..."
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleUpdateApplicationRecord(appStatus)}
                      disabled={savingStatus}
                      style={{
                        padding: '8px 18px',
                        borderRadius: '7px',
                        background: 'var(--brand)',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: savingStatus ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {savingStatus ? 'Saving…' : 'Save Status & Notes'}
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 5: Official Submission Handoff */}
              {activeTab === 'handoff' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--bg-app)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '18px' }}>🌐</span>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Official Employer Application Portal
                      </h3>
                    </div>
                    <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {opportunity.company_name} requires submissions directly through their official career portal. Compass prepares your truthful documents and prefilled answers to make completion fast and accurate.
                    </p>

                    {opportunity.official_application_url ? (
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <a
                          href={opportunity.official_application_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '10px 18px',
                            borderRadius: '8px',
                            background: 'var(--brand)',
                            color: '#ffffff',
                            fontWeight: 600,
                            fontSize: '13px',
                            textDecoration: 'none',
                          }}
                        >
                          <span>Open Employer Application Portal</span>
                          <span>↗</span>
                        </a>

                        <button
                          type="button"
                          onClick={handleConfirmExternalSubmission}
                          style={{
                            padding: '10px 18px',
                            borderRadius: '8px',
                            background: appStatus === 'submitted' ? '#dcfce7' : 'var(--bg-card)',
                            color: appStatus === 'submitted' ? '#166534' : 'var(--text-primary)',
                            border: '1px solid var(--border)',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: 'pointer',
                          }}
                        >
                          {appStatus === 'submitted' ? '✓ Marked as Submitted' : 'Mark as Submitted Externally'}
                        </button>
                      </div>
                    ) : (
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        No direct application URL verified for this opportunity yet.
                      </div>
                    )}
                  </div>

                  {/* Fast Copy-Paste Application Helper */}
                  <div style={{ padding: '16px', borderRadius: '10px', background: 'var(--bg-app)', border: '1px solid var(--border)' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Quick Copy Tools for Portal Questions
                    </h4>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(summary || '')
                          showNotification('Summary copied to clipboard!')
                        }}
                        style={{ padding: '6px 12px', borderRadius: '6px', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '12px', cursor: 'pointer' }}
                      >
                        📋 Copy Summary
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(skillsText || '')
                          showNotification('Skills copied to clipboard!')
                        }}
                        style={{ padding: '6px 12px', borderRadius: '6px', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '12px', cursor: 'pointer' }}
                      >
                        📋 Copy Skills
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(coverLetterText || '')
                          showNotification('Cover letter copied to clipboard!')
                        }}
                        style={{ padding: '6px 12px', borderRadius: '6px', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '12px', cursor: 'pointer' }}
                      >
                        📋 Copy Cover Letter
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-app)',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Application ID: {application?.id ? `#${application.id}` : 'Preparing…'}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Done & Return to Radar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
