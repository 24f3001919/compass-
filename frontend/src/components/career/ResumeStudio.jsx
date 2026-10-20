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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)' }}>
            📄 Evidence-Based Resume Studio
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
            Anchor your master career profile to verified evidence and generate tailored ATS resumes without qualification hallucination.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            style={{
              background: 'var(--bg-card-soft)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            📥 Import Resume (.pdf / .docx)
          </button>
          <button
            type="button"
            onClick={() => setShowGitHubModal(true)}
            style={{
              background: 'var(--bg-card-soft)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            🐙 GitHub Intelligence
          </button>
          <button
            type="button"
            onClick={() => setShowExternalProfileModal(true)}
            style={{
              background: 'var(--bg-card-soft)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              padding: '8px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
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
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                      background: isSelected ? 'var(--primary-soft, #eff6ff)' : 'var(--bg-card-soft)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-primary)' }}>
                        {res.title}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {res.is_master ? '★ Master Source of Truth' : `v${res.version} Tailored`}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '2px 8px',
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
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
          {/* Header & Mode Switcher */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>
                {selectedResume?.is_master ? 'Master Profile Information' : selectedResume?.title}
              </h3>
              {isTailored && (
                <span style={{ fontSize: '11px', color: 'var(--primary)', background: '#eff6ff', padding: '2px 8px', borderRadius: '6px', fontWeight: '600' }}>
                  Tailored Variant (Master Profile is Immutable)
                </span>
              )}
            </div>

            {/* Template Selector & Export Dropdowns */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <select
                value={resumeTemplate}
                onChange={(e) => setResumeTemplate(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', background: 'var(--bg-card)' }}
              >
                <option value="ats_classic">ATS Classic</option>
                <option value="modern">Modern Clean</option>
                <option value="minimal">Minimalist</option>
              </select>

              {selectedResume && (
                <>
                  <a
                    href={getResumeExportUrl(selectedResume.id, resumeTemplate)}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      background: 'var(--primary, #2563eb)',
                      color: '#fff',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '700',
                      textDecoration: 'none',
                    }}
                  >
                    📄 Print / PDF
                  </a>
                  <a
                    href={getResumeExportDocxUrl(selectedResume.id)}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      background: 'var(--bg-card-soft, #f8fafc)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
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
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '16px' }}>
            <button
              type="button"
              onClick={() => { setActiveTab('resume'); setViewMode('editor'); }}
              style={{
                background: activeTab === 'resume' && viewMode === 'editor' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'resume' && viewMode === 'editor' ? '#fff' : 'var(--text-muted)',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              📄 Resume Editor
            </button>

            {isTailored && (
              <button
                type="button"
                onClick={() => setViewMode('diff')}
                style={{
                  background: viewMode === 'diff' ? 'var(--primary)' : 'transparent',
                  color: viewMode === 'diff' ? '#fff' : 'var(--text-muted)',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                ⚖️ Master vs Tailored Diff
              </button>
            )}

            <button
              type="button"
              onClick={() => { setActiveTab('cover_letter'); setViewMode('editor'); }}
              style={{
                background: activeTab === 'cover_letter' && viewMode === 'editor' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'cover_letter' && viewMode === 'editor' ? '#fff' : 'var(--text-muted)',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              ✍️ Truthful Cover Letter
            </button>
          </div>

          {/* Body Content */}
          {viewMode === 'diff' && isTailored ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: '800' }}>Skills Alignment Breakdown</h4>
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>🎯 Emphasized & Re-ordered for Opportunity:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {(diffSummary.highlighted_skills || []).map((s, idx) => (
                      <span key={idx} style={{ background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600' }}>
                        ✓ {s}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>💤 Deprioritized / Omitted Master Skills (not required by role):</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {(diffSummary.omitted_master_skills || []).map((s, idx) => (
                      <span key={idx} style={{ background: '#f1f5f9', color: '#64748b', padding: '3px 8px', borderRadius: '4px', fontSize: '12px' }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: '800' }}>Targeted Project Relevance Order</h4>
                <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '13px' }}>
                  {(diffSummary.project_order || []).map((pTitle, idx) => (
                    <li key={idx} style={{ marginBottom: '4px' }}>
                      <strong>{pTitle}</strong>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : activeTab === 'resume' ? (
            <form onSubmit={handleSaveResume} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card-soft)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card-soft)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px' }}>Phone</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card-soft)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px' }}>Location</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Bangalore, India"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card-soft)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px' }}>Summary</label>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={3}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card-soft)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Technical Skills (comma-separated, verified against factual grounding)
                </label>
                <textarea
                  value={skillsText}
                  onChange={(e) => setSkillsText(e.target.value)}
                  rows={2}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card-soft)', color: 'var(--text-primary)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={handleRunValidation}
                  style={{
                    background: 'var(--bg-card-soft)',
                    border: '1px solid var(--border)',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  🔍 Verify Factual Claims
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: 'var(--primary)',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 22px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '700',
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? 'Saving...' : (selectedResume?.is_master ? 'Save Master Anchor' : 'Save Tailored Resume')}
                </button>
              </div>
            </form>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Grounded strictly in verified master projects and skills.
                </div>
                {selectedResume?.opportunity_id && (
                  <button
                    type="button"
                    onClick={handleDraftCoverLetter}
                    disabled={draftingLetter}
                    style={{
                      background: 'var(--primary)',
                      color: '#fff',
                      border: 'none',
                      padding: '6px 14px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: draftingLetter ? 'not-allowed' : 'pointer',
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
