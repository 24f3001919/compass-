import React, { useState, useEffect } from 'react'
import {
  fetchMasterResume,
  updateMasterResume,
  fetchResumes,
  validateResume,
  getResumeExportUrl,
  parseUploadResume,
  draftCoverLetter,
} from '../../api/careerApi'
import ValidationReportCard from './ValidationReportCard'
import ResumeImportModal from './ResumeImportModal'

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

  // Cover Letter & Import states
  const [activeTab, setActiveTab] = useState('resume') // 'resume' | 'cover_letter'
  const [coverLetterText, setCoverLetterText] = useState('')
  const [draftingLetter, setDraftingLetter] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importSuccess, setImportSuccess] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
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
  }

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
  }

  const handleImportResume = async () => {
    if (!importText.trim()) return
    setImporting(true)
    setError(null)
    try {
      const parsed = await parseUploadResume(importText)
      if (parsed.full_name) setFullName(parsed.full_name)
      if (parsed.email) setEmail(parsed.email)
      if (parsed.phone) setPhone(parsed.phone)
      if (parsed.location) setLocation(parsed.location)
      if (parsed.summary) setSummary(parsed.summary)
      if (parsed.skills?.length) setSkillsText(parsed.skills.join(', '))
      setImportSuccess(true)
      setTimeout(() => {
        setShowImportModal(false)
        setImportSuccess(false)
        setImportText('')
      }, 1000)
    } catch (err) {
      setError(err.message || 'Failed to parse resume text')
    } finally {
      setImporting(false)
    }
  }

  const handleFileExtracted = (extracted) => {
    if (!extracted) return
    if (extracted.full_name) setFullName(extracted.full_name)
    if (extracted.email) setEmail(extracted.email)
    if (extracted.phone) setPhone(extracted.phone)
    if (extracted.location) setLocation(extracted.location)
    if (extracted.summary) setSummary(extracted.summary)
    if (extracted.skills?.length) setSkillsText(extracted.skills.join(', '))
    setShowImportModal(false)
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

  const handleSaveMaster = async (e) => {
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

      const updated = await updateMasterResume(updatedContent)
      setMasterResume(updated)
      setSelectedResume(updated)
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
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div className="spinner" style={{ margin: '0 auto 12px' }} />
        <p>Loading Resume Studio...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 8px 32px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: '800', color: 'var(--text-primary)' }}>
            📄 Resume Studio
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
            Manage your verified master resume and tailor role-specific variants without qualification hallucination.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            style={{
              background: 'var(--bg-card-soft)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            📋 Import / Paste Resume
          </button>

          {selectedResume && (
            <>
              <button
                type="button"
                onClick={handleRunValidation}
                style={{
                  background: 'var(--bg-card-soft)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                🔍 Validate Factual Integrity
              </button>
              <a
                href={getResumeExportUrl(selectedResume.id)}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: 'var(--primary)',
                  color: '#fff',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                📥 Export ATS Resume
              </a>
            </>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '13px' }}>
          ⚠️ {error}
        </div>
      )}

      {saveSuccess && (
        <div style={{ background: '#dcfce7', color: '#166534', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '13px' }}>
          ✅ Master resume updated and factually anchored!
        </div>
      )}

      {/* Main Grid: Selector Sidebar & Editor/Report */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', alignItems: 'start' }}>
        {/* Left Column: Version Selector & Factual Report Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Versions Card */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>
              Resume Versions ({resumesList.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
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
                      border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                      background: isSelected ? 'var(--primary-soft, #eff6ff)' : 'var(--bg-card-soft)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-primary)' }}>
                        {res.title}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {res.is_master ? '★ Master Source of Truth' : `v${res.version} Tailored`}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
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

          {/* Factual Integrity & Validation Report Card */}
          <ValidationReportCard validationReport={validationReport} />
        </div>

        {/* Right Column: Resume Editor & Cover Letter Studio */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>
              {selectedResume?.is_master ? 'Master Profile Information' : selectedResume?.title}
            </h3>
            {selectedResume?.opportunity_id && (
              <span style={{ fontSize: '11px', color: 'var(--primary)', background: '#eff6ff', padding: '2px 8px', borderRadius: '6px', fontWeight: '600' }}>
                Role Specific
              </span>
            )}
          </div>

          {/* Sub-tabs: Resume Profile vs Cover Letter */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '16px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('resume')}
              style={{
                background: activeTab === 'resume' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'resume' ? '#fff' : 'var(--text-muted)',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              📄 Resume Profile
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('cover_letter')}
              style={{
                background: activeTab === 'cover_letter' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'cover_letter' ? '#fff' : 'var(--text-muted)',
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

          {activeTab === 'resume' ? (
            <form onSubmit={handleSaveMaster} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-card-soft)',
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box',
                    }}
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
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-card-soft)',
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Phone
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-card-soft)',
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Location
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Bengaluru, India"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-card-soft)',
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Professional Summary
                </label>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={3}
                  placeholder="Undergraduate computer science scholar specializing in AI/ML systems and backend engineering..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-card-soft)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Technical Skills (Comma separated — strict factual ground)
                </label>
                <textarea
                  value={skillsText}
                  onChange={(e) => setSkillsText(e.target.value)}
                  rows={2}
                  placeholder="Python, PyTorch, C++, FastAPI, Docker, SQL, Git"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-card-soft)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: 'var(--primary)',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '700',
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? 'Saving...' : 'Save Master Anchor'}
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
                placeholder="No cover letter drafted yet. Click 'Generate Truthful Cover Letter' or paste custom content anchored to your real projects..."
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card-soft)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
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
                    color: 'var(--text-primary)',
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

      {/* Import / Paste Resume Text Modal */}
      <ResumeImportModal
        show={showImportModal}
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        importText={importText}
        setImportText={setImportText}
        onImport={handleImportResume}
        importing={importing}
        importSuccess={importSuccess}
        onFileExtracted={handleFileExtracted}
      />
    </div>
  )
}
