import React, { useState, useEffect, useCallback } from 'react'
import {
  fetchMasterResume,
  updateMasterResume,
  fetchResumes,
  updateResume,
  validateResume,
  getResumeExportUrl,
  getResumeExportDocxUrl,
  parseUploadResume,
  commitExtractedResume,
  draftCoverLetter,
} from '../../api/careerApi'
import { safeHref } from '../../api/baseClient.js'

import ValidationReportCard from './ValidationReportCard'
import ResumeImportModal from './ResumeImportModal'
import ExtractionReviewModal from './ExtractionReviewModal'
import ExternalProfileImportModal from './ExternalProfileImportModal'

const GitHubIntelligenceModal = React.lazy(() => import('./GitHubIntelligenceModal'))

export default function ResumeStudio() {
  const [masterResume, setMasterResume] = useState(null)
  const [resumesList, setResumesList] = useState([])
  const [selectedResume, setSelectedResume] = useState(null)
  const [validationReport, setValidationReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState(null)

  // Form edit states
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [location, setLocation] = useState('')
  const [summary, setSummary] = useState('')
  const [skillsText, setSkillsText] = useState('')

  // Modals & Intelligence states
  const [showImportModal, setShowImportModal] = useState(false)
  const [showExtractionModal, setShowExtractionModal] = useState(false)
  const [parseResult, setParseResult] = useState(null)
  const [committingExtraction, setCommittingExtraction] = useState(false)
  const [showGitHubModal, setShowGitHubModal] = useState(false)
  const [showExternalProfileModal, setShowExternalProfileModal] = useState(false)

  // Review & Export customization
  const [resumeTemplate, setResumeTemplate] = useState('ats_classic') // ats_classic | modern | minimal
  const [viewMode, setViewMode] = useState('editor') // 'editor' | 'diff'
  const [activeTab, setActiveTab] = useState('resume') // 'resume' | 'cover_letter'
  const [coverLetterText, setCoverLetterText] = useState('')
  const [draftingLetter, setDraftingLetter] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [master, list] = await Promise.all([
        fetchMasterResume(),
        fetchResumes(),
      ])
      setMasterResume(master)
      setResumesList(list)
      setSelectedResume(master)
      populateForm(master)
      setValidationReport(master?.validation_report || null)
    } catch (err) {
      setError(err.message || 'Failed to load resumes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const populateForm = (res) => {
    if (!res || !res.content) return
    const c = res.content
    setFullName(c.full_name || '')
    setEmail(c.email || '')
    setPhone(c.phone || '')
    setLocation(c.location || '')
    setSummary(c.summary || '')
    setSkillsText((c.skills || []).join(', '))
    setCoverLetterText(res.cover_letter || '')
  }

  const handleSelectResume = (res) => {
    setSelectedResume(res)
    populateForm(res)
    setValidationReport(res.validation_report || null)
    setSaveSuccess(false)
    setViewMode('editor')
  }

  // Handle uploaded file or pasted text -> opens Extraction Review Screen
  const handleFileExtracted = (result) => {
    setParseResult(result)
    setShowImportModal(false)
    setShowExtractionModal(true)
  }

  const handleImportPastedText = async () => {
    if (!importText.trim()) return
    setImporting(true)
    setError(null)
    try {
      const parsed = await parseUploadResume(importText)
      const fakeResult = {
        success: true,
        filename: 'Pasted Text Document',
        file_type: '.txt',
        raw_text: importText,
        extracted_content: parsed,
        missing_fields: [],
        field_confidence: { overall: 0.85 },
      }
      setParseResult(fakeResult)
      setShowImportModal(false)
      setShowExtractionModal(true)
      setImportText('')
    } catch (err) {
      setError(err.message || 'Failed to parse resume text')
    } finally {
      setImporting(false)
    }
  }

  // Commit from Extraction Review Modal
  const handleCommitExtraction = async (editedContent, docId, target = 'master') => {
    setCommittingExtraction(true)
    setError(null)
    try {
      const saved = await commitExtractedResume(editedContent, docId, target)
      setShowExtractionModal(false)
      setSaveSuccess(true)
      await loadData()
      if (saved) {
        handleSelectResume(saved)
      }
    } catch (err) {
      setError(err.message || 'Failed to commit extracted resume data')
    } finally {
      setCommittingExtraction(false)
    }
  }

  // GitHub Intelligence imports
  const handleImportGitHubRepo = async (repo) => {
    if (!masterResume?.content) return
    try {
      const currentProjects = masterResume.content.projects || []
      const newProject = {
        title: repo.repo_name,
        description: repo.description || 'Open source software repository implementation.',
        technologies: repo.detected_technologies || [],
        project_url: repo.repo_url,
        highlights: repo.implementation_evidence || [],
        evidence_classification: 'REPOSITORY_EVIDENCE',
      }
      const updatedContent = {
        ...masterResume.content,
        projects: [newProject, ...currentProjects.filter(p => p.title !== repo.repo_name)],
      }
      const updated = await updateMasterResume(updatedContent)
      setMasterResume(updated)
      if (selectedResume?.is_master) {
        setSelectedResume(updated)
        populateForm(updated)
      }
      setSaveSuccess(true)
      alert(`✓ Repository "${repo.repo_name}" imported into Master Profile projects!`)
    } catch (err) {
      setError(err.message || 'Failed to import repository')
    }
  }

  const handleImportGitHubSkills = async (skills) => {
    if (!masterResume?.content) return
    try {
      const currentSkills = new Set(masterResume.content.skills || [])
      skills.forEach(s => currentSkills.add(s))
      const updatedContent = {
        ...masterResume.content,
        skills: Array.from(currentSkills),
      }
      const updated = await updateMasterResume(updatedContent)
      setMasterResume(updated)
      if (selectedResume?.is_master) {
        setSelectedResume(updated)
        populateForm(updated)
      }
      setSaveSuccess(true)
      alert(`✓ Added ${skills.length} verified technologies to Master Profile!`)
    } catch (err) {
      setError(err.message || 'Failed to import skills')
    }
  }

  const handleDraftCoverLetter = async () => {
    if (!selectedResume?.opportunity_id) return
    setDraftingLetter(true)
    setError(null)
    try {
      const res = await draftCoverLetter(selectedResume.opportunity_id)
      setCoverLetterText(res.content)
      setActiveTab('cover_letter')
    } catch (err) {
      setError(err.message || 'Failed to draft cover letter')
    } finally {
      setDraftingLetter(false)
    }
  }

  // Save handler enforcing Master Resume Immutability
  const handleSaveResume = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaveSuccess(false)
    try {
      const skillsArray = skillsText
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

      const updatedContent = {
        ...(selectedResume?.content || {}),
        full_name: fullName,
        email: email,
        phone: phone,
        location: location,
        summary: summary,
        skills: skillsArray,
      }

      if (selectedResume?.is_master) {
        const updated = await updateMasterResume(updatedContent)
        setMasterResume(updated)
        setSelectedResume(updated)
      } else if (selectedResume) {
        // Tailored variant save - strictly preserves master resume unmodified
        const updated = await updateResume(selectedResume.id, {
          title: selectedResume.title,
          content: updatedContent,
          cover_letter: coverLetterText,
        })
        setSelectedResume(updated)
      }

      setSaveSuccess(true)
      const list = await fetchResumes()
      setResumesList(list)
    } catch (err) {
      setError(err.message || 'Failed to update resume')
    } finally {
      setSaving(false)
    }
  }

  const handleRunValidation = async () => {
    if (!selectedResume) return
    try {
      const report = await validateResume(selectedResume.id)
      setValidationReport(report)
    } catch (err) {
      setError(err.message || 'Validation failed')
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div className="spinner" style={{ margin: '0 auto 12px' }} />
        <p>Loading Evidence-Based Resume Studio...</p>
      </div>
    )
  }

  // Diff comparison data
  const isTailored = selectedResume && !selectedResume.is_master
  const diffSummary = selectedResume?.validation_report?.diff_summary || {}

  return (
    <div style={{ padding: '0 8px 36px', maxWidth: '1240px', margin: '0 auto' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '22px' }}>
        <div>
          <h2 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            📄 Evidence-Based Resume Studio
          </h2>
          <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Anchor your master career profile to verified evidence and generate tailored ATS resumes without qualification hallucination.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            style={{
              background: 'var(--primary, #2563eb)',
              border: 'none',
              color: '#ffffff',
              padding: '9px 16px',
              borderRadius: '9px',
              fontSize: '13px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
              transition: 'transform 0.15s ease, background 0.15s ease',
            }}
          >
            📥 Import Resume (.pdf / .docx)
          </button>
          <button
            type="button"
            onClick={() => setShowGitHubModal(true)}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              padding: '9px 15px',
              borderRadius: '9px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
            }}
          >
            🐙 GitHub Intelligence
          </button>
          <button
            type="button"
            onClick={() => setShowExternalProfileModal(true)}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              padding: '9px 15px',
              borderRadius: '9px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
            }}
          >
            🔗 LinkedIn / External
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
          ⚠️ {error}
        </div>
      )}

      {saveSuccess && (
        <div style={{ background: '#dcfce7', color: '#166534', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
          ✅ Resume changes successfully saved and factually anchored!
        </div>
      )}

      {/* Main Grid: Left sidebar versions / validation card, Right editor / diff */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', alignItems: 'start' }}>
        {/* Left Column: Versions & Integrity Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Versions Selector */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>
                Resume Versions ({resumesList.length})
              </h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto' }}>
              {resumesList.map((res) => {
                const isSelected = selectedResume?.id === res.id
                return (
                  <button
                    key={res.id}
                    type="button"
                    onClick={() => handleSelectResume(res)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '11px 13px',
                      borderRadius: '10px',
                      border: isSelected ? '2px solid var(--primary, #2563eb)' : '1px solid var(--border)',
                      background: isSelected ? 'var(--primary-soft, #eff6ff)' : 'var(--bg-card)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 2px 8px rgba(37, 99, 235, 0.15)' : 'none',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '13.5px', color: 'var(--text-primary)' }}>
                        {res.title}
                      </div>
                      <div style={{ fontSize: '11.5px', color: isSelected ? 'var(--primary, #2563eb)' : 'var(--text-secondary)', fontWeight: isSelected ? '600' : '400', marginTop: '2px' }}>
                        {res.is_master ? '★ Master Source of Truth' : `v${res.version} Tailored`}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontWeight: '700',
                        background: res.validation_status === 'APPROVED' ? '#dcfce7' : '#fef3c7',
                        color: res.validation_status === 'APPROVED' ? '#166534' : '#92400e',
                      }}
                    >
                      {res.validation_status}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Validation Report Card */}
          <ValidationReportCard validationReport={validationReport} />
        </div>

        {/* Right Column: Editor / Diff Viewer */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '26px', boxShadow: 'var(--shadow-sm)' }}>
          {/* Header & Mode Switcher */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '18px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: 'var(--text-primary)' }}>
                {selectedResume?.is_master ? 'Master Profile Information' : selectedResume?.title}
              </h3>
              {isTailored && (
                <span style={{ fontSize: '11.5px', color: 'var(--primary, #2563eb)', background: 'var(--primary-soft, #eff6ff)', padding: '3px 10px', borderRadius: '6px', fontWeight: '600', display: 'inline-block', marginTop: '4px' }}>
                  Tailored Variant (Master Profile is Immutable)
                </span>
              )}
            </div>

            {/* Template Selector & Export Dropdowns */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <select
                value={resumeTemplate}
                onChange={(e) => setResumeTemplate(e.target.value)}
                style={{ padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12.5px', background: 'var(--bg-card)', color: 'var(--text-primary)', fontWeight: '500' }}
              >
                <option value="ats_classic">ATS Classic</option>
                <option value="modern">Modern Clean</option>
                <option value="minimal">Minimalist</option>
              </select>

              {selectedResume && (
                <>
                  <a
                    href={safeHref(getResumeExportUrl(selectedResume.id, resumeTemplate))}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      background: 'var(--primary, #2563eb)',
                      color: '#ffffff',
                      padding: '7px 14px',
                      borderRadius: '8px',
                      fontSize: '12.5px',
                      fontWeight: '700',
                      textDecoration: 'none',
                      boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
                    }}
                  >
                    📄 Print / PDF
                  </a>
                  <a
                    href={safeHref(getResumeExportDocxUrl(selectedResume.id))}
                    target="_blank"
                    rel="noreferrer"

                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      padding: '7px 14px',
                      borderRadius: '8px',
                      fontSize: '12.5px',
                      fontWeight: '700',
                      textDecoration: 'none',
                    }}
                  >
                    📝 Word (.docx)
                  </a>
                </>
              )}
            </div>
          </div>

          {/* Sub-tabs: Resume Profile vs Cover Letter vs Diff */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '18px' }}>
            <button
              type="button"
              onClick={() => { setActiveTab('resume'); setViewMode('editor'); }}
              style={{
                background: activeTab === 'resume' && viewMode === 'editor' ? 'var(--primary, #2563eb)' : 'var(--bg-card-soft)',
                color: activeTab === 'resume' && viewMode === 'editor' ? '#ffffff' : 'var(--text-secondary)',
                border: activeTab === 'resume' && viewMode === 'editor' ? 'none' : '1px solid var(--border)',
                padding: '7px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: activeTab === 'resume' && viewMode === 'editor' ? '0 2px 8px rgba(37, 99, 235, 0.25)' : 'none',
              }}
            >
              📄 Resume Editor
            </button>

            {isTailored && (
              <button
                type="button"
                onClick={() => setViewMode('diff')}
                style={{
                  background: viewMode === 'diff' ? 'var(--primary, #2563eb)' : 'var(--bg-card-soft)',
                  color: viewMode === 'diff' ? '#ffffff' : 'var(--text-secondary)',
                  border: viewMode === 'diff' ? 'none' : '1px solid var(--border)',
                  padding: '7px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  boxShadow: viewMode === 'diff' ? '0 2px 8px rgba(37, 99, 235, 0.25)' : 'none',
                }}
              >
                ⚖️ Master vs Tailored Diff
              </button>
            )}

            <button
              type="button"
              onClick={() => { setActiveTab('cover_letter'); setViewMode('editor'); }}
              style={{
                background: activeTab === 'cover_letter' && viewMode === 'editor' ? 'var(--primary, #2563eb)' : 'var(--bg-card-soft)',
                color: activeTab === 'cover_letter' && viewMode === 'editor' ? '#ffffff' : 'var(--text-secondary)',
                border: activeTab === 'cover_letter' && viewMode === 'editor' ? 'none' : '1px solid var(--border)',
                padding: '7px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: activeTab === 'cover_letter' && viewMode === 'editor' ? '0 2px 8px rgba(37, 99, 235, 0.25)' : 'none',
              }}
            >
              ✍️ Truthful Cover Letter
            </button>
          </div>

          {/* Body Content */}
          {viewMode === 'diff' && isTailored ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: 'var(--bg-card-soft)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <h4 style={{ margin: '0 0 10px', fontSize: '13.5px', fontWeight: '800', color: 'var(--text-primary)' }}>Skills Alignment Breakdown</h4>
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '6px' }}>🎯 Emphasized & Re-ordered for Opportunity:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {(diffSummary.highlighted_skills || []).map((s, idx) => (
                      <span key={idx} style={{ background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600' }}>
                        ✓ {s}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', marginBottom: '6px' }}>💤 Deprioritized / Omitted Master Skills (not required by role):</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {(diffSummary.omitted_master_skills || []).map((s, idx) => (
                      <span key={idx} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '3px 8px', borderRadius: '6px', fontSize: '12px' }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-card-soft)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <h4 style={{ margin: '0 0 10px', fontSize: '13.5px', fontWeight: '800', color: 'var(--text-primary)' }}>Targeted Project Relevance Order</h4>
                <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text-primary)' }}>
                  {(diffSummary.project_order || []).map((pTitle, idx) => (
                    <li key={idx} style={{ marginBottom: '6px' }}>
                      <strong>{pTitle}</strong>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : activeTab === 'resume' ? (
            <form onSubmit={handleSaveResume} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>Phone</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>Location</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Bangalore, India"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>Summary</label>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={3}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', lineHeight: 1.5 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Technical Skills (comma-separated, verified against factual grounding)
                </label>
                <textarea
                  value={skillsText}
                  onChange={(e) => setSkillsText(e.target.value)}
                  rows={2}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', lineHeight: 1.5 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px' }}>
                <button
                  type="button"
                  onClick={handleRunValidation}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    padding: '9px 16px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
                  }}
                >
                  🔍 Verify Factual Claims
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: 'var(--primary, #2563eb)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '10px 24px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '700',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {saving ? 'Saving...' : (selectedResume?.is_master ? 'Save Master Anchor' : 'Save Tailored Resume')}
                </button>
              </div>
            </form>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ fontSize: '13.5px', color: 'var(--text-secondary)', fontWeight: '500' }}>
                  Grounded strictly in verified master projects and skills.
                </div>
                {selectedResume?.opportunity_id && (
                  <button
                    type="button"
                    onClick={handleDraftCoverLetter}
                    disabled={draftingLetter}
                    style={{
                      background: 'var(--primary, #2563eb)',
                      color: '#ffffff',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '12.5px',
                      fontWeight: '700',
                      cursor: draftingLetter ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                    }}
                  >
                    {draftingLetter ? 'Drafting...' : '✨ Generate Truthful Cover Letter'}
                  </button>
                )}
              </div>

              <textarea
                value={coverLetterText}
                onChange={(e) => setCoverLetterText(e.target.value)}
                rows={12}
                placeholder="No cover letter drafted yet. Click 'Generate Truthful Cover Letter'..."
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card-soft)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  lineHeight: '1.6',
                  fontFamily: 'monospace',
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(coverLetterText)
                    alert('Cover letter copied to clipboard!')
                  }}
                  style={{
                    background: 'var(--bg-card-soft)',
                    border: '1px solid var(--border)',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  📋 Copy to Clipboard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <ResumeImportModal
        show={showImportModal}
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        importText={importText}
        setImportText={setImportText}
        onImport={handleImportPastedText}
        importing={importing}
        onFileExtracted={handleFileExtracted}
      />

      <ExtractionReviewModal
        show={showExtractionModal}
        onClose={() => setShowExtractionModal(false)}
        parseResult={parseResult}
        onCommit={handleCommitExtraction}
        committing={committingExtraction}
      />

      {showGitHubModal && (
        <React.Suspense fallback={null}>
          <GitHubIntelligenceModal
            show={showGitHubModal}
            onClose={() => setShowGitHubModal(false)}
            onImportRepoToMaster={handleImportGitHubRepo}
            onImportSkillsToMaster={handleImportGitHubSkills}
          />
        </React.Suspense>
      )}

      <ExternalProfileImportModal
        show={showExternalProfileModal}
        onClose={() => setShowExternalProfileModal(false)}
        onProfileIngested={(content, source) => {
          setParseResult({
            success: true,
            filename: `External Source (${source})`,
            file_type: 'profile_import',
            extracted_content: content,
            missing_fields: [],
            field_confidence: { overall: 0.9 },
          })
          setShowExtractionModal(true)
        }}
      />
    </div>
  )
}
