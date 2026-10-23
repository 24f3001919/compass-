import React, { useState } from 'react'

const PIPELINE_STATUSES = [
  { id: 'interested', label: 'Interested' },
  { id: 'preparing', label: 'Preparing Application' },
  { id: 'ready_to_apply', label: 'Ready to Apply' },
  { id: 'applied', label: 'Applied' },
  { id: 'assessment_pending', label: 'Assessment Pending' },
  { id: 'interviewing', label: 'Interviewing' },
  { id: 'offer_received', label: 'Offer Received' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'withdrawn', label: 'Withdrawn' },
  { id: 'closed_without_applying', label: 'Closed Without Applying' },
]

export default function RadarDetailModal({
  opportunity,
  onClose,
  onUpdateApp,
  onVerify,
  isVerifying,
  onApply,
}) {
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'eligibility' | 'history' | 'tracking'
  const [appStatus, setAppStatus] = useState(opportunity?.application_status || 'interested')
  const [personalDeadline, setPersonalDeadline] = useState(opportunity?.personal_deadline || '')
  const [privateNotes, setPrivateNotes] = useState(opportunity?.private_notes || '')
  const [isSavingApp, setIsSavingApp] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  if (!opportunity) return null

  const handleSaveTracking = async e => {
    e.preventDefault()
    setIsSavingApp(true)
    setSaveSuccess(false)
    try {
      await onUpdateApp(opportunity.id, {
        application_status: appStatus,
        personal_deadline: personalDeadline || null,
        private_notes: privateNotes || null,
      })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } finally {
      setIsSavingApp(false)
    }
  }

  const {
    company_name,
    role_title,
    location,
    work_arrangement,
    current_status,
    official_application_url,
    description,
    compensation,
    duration,
    eligibility_classification,
    eligibility_explanation,
    eligibility_reasons = [],
    cycles = [],
    prediction,
    sources = [],
    last_verified_at,
    employer_type,
    verification_evidence,
    employer_identity_verified,
    official_source_confirmed,
    application_url_checked,
    is_official_source: _is_official_source,
    verification_failure_reason,
    source_identifier,
  } = opportunity

  const getEmployerTypeLabel = type => {
    switch (type) {
      case 'startup':
        return { label: '🚀 Startup', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' }
      case 'research':
        return { label: '🔬 Research Lab', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.1)' }
      case 'government':
        return { label: '🏛️ Government / Public', color: '#d97706', bg: 'rgba(217, 119, 6, 0.1)' }
      case 'open_source':
        return { label: '🌐 Open Source Fellowship', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' }
      case 'sme':
        return { label: '💼 SME', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.1)' }
      case 'enterprise':
      default:
        return { label: '🏢 Enterprise', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' }
    }
  }

  const empTypeInfo = getEmployerTypeLabel(employer_type)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        zIndex: 999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          background: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '16px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase' }}>
                {company_name}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  color: empTypeInfo.color,
                  backgroundColor: empTypeInfo.bg,
                }}
              >
                {empTypeInfo.label}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>•</span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Status: <strong>{current_status.replace(/_/g, ' ')}</strong>
              </span>
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {role_title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '22px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Navigation Sub-tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-app)',
            padding: '0 24px',
            gap: '12px',
            overflowX: 'auto',
          }}
        >
          {[
            { id: 'overview', label: 'Overview & Details' },
            { id: 'eligibility', label: `Eligibility Audit (${eligibility_classification})` },
            { id: 'history', label: `Recruitment Cycles (${cycles.length})` },
            { id: 'tracking', label: 'My Application Tracker' },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '12px 14px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--brand)' : '2px solid transparent',
                color: activeTab === tab.id ? 'var(--brand)' : 'var(--text-secondary)',
                fontWeight: activeTab === tab.id ? 600 : 500,
                fontSize: '13px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modal Content Scroll Area */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--bg-app)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Location</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {location || 'Flexible / India'}
                  </div>
                </div>
                <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--bg-app)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Work Arrangement</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px', textTransform: 'capitalize' }}>
                    {work_arrangement}
                  </div>
                </div>
                {compensation && (
                  <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--bg-app)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Compensation</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#10b981', marginTop: '2px' }}>
                      {compensation}
                    </div>
                  </div>
                )}
                {duration && (
                  <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--bg-app)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Duration</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                      {duration}
                    </div>
                  </div>
                )}
              </div>

              {description && (
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Role Overview
                  </h4>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                    {description}
                  </div>
                </div>
              )}

              {/* Provenance Sources */}
              {sources.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Provenance & Verified Sources
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {sources.map((src, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-app)',
                          fontSize: '12px',
                        }}
                      >
                        <div>
                          <strong>{src.source_name}</strong> ({src.source_type})
                          <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                            {src.source_url}
                          </div>
                        </div>
                        <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'var(--bg-card)', fontSize: '11px' }}>
                          {src.source_authority}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Evidence-Based Verification Status */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  background: 'rgba(59, 130, 246, 0.05)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🛡️</span>
                    <span>Evidence-Based Verification Status</span>
                  </h4>
                  {last_verified_at && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Last checked: {new Date(last_verified_at).toLocaleDateString()} {new Date(last_verified_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '8px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{official_source_confirmed ? '✅' : '⚠️'}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Official Portal: <strong>{official_source_confirmed ? 'Confirmed' : 'Aggregated / Discovery'}</strong>
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{employer_identity_verified ? '✅' : 'ℹ️'}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Employer Identity: <strong>{employer_identity_verified ? 'Verified Entity' : 'Candidate'}</strong>
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{application_url_checked ? '✅' : '❓'}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Application Link: <strong>{application_url_checked ? 'Reachable (Live)' : 'Pending Check'}</strong>
                    </span>
                  </div>
                  {source_identifier && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🏷️</span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Requisition ID: <code style={{ fontSize: '11px' }}>{source_identifier}</code>
                      </span>
                    </div>
                  )}
                </div>

                {verification_evidence && (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-card)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 600 }}>Evidence Note: </span>
                    <span>{verification_evidence}</span>
                  </div>
                )}

                {verification_failure_reason && (
                  <div style={{ fontSize: '12px', color: '#dc2626', background: 'rgba(239, 68, 68, 0.08)', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                    <span style={{ fontWeight: 600 }}>Verification Note: </span>
                    <span>{verification_failure_reason}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* TAB 2: ELIGIBILITY AUDIT */}
          {activeTab === 'eligibility' && (
            <div>
              {/* Classification Summary Card */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  marginBottom: '16px',
                  background:
                    eligibility_classification === 'ELIGIBLE'
                      ? 'rgba(16, 185, 129, 0.1)'
                      : (eligibility_classification === 'INELIGIBLE'
                          ? 'rgba(239, 68, 68, 0.1)'
                          : 'rgba(245, 166, 35, 0.1)'),
                  border: `1px solid ${
                    eligibility_classification === 'ELIGIBLE'
                      ? '#10b981'
                      : (eligibility_classification === 'INELIGIBLE'
                          ? '#ef4444'
                          : '#f5a623')
                  }`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '18px' }}>
                    {eligibility_classification === 'ELIGIBLE' ? '✅' : (eligibility_classification === 'INELIGIBLE' ? '❌' : '⚠️')}
                  </span>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>
                    {eligibility_classification === 'ELIGIBLE' && 'Confirmed Eligible to Apply'}
                    {(eligibility_classification === 'POTENTIAL_MATCH' || eligibility_classification === 'POTENTIALLY_ELIGIBLE') && 'Potentially Eligible (Verification Required)'}
                    {eligibility_classification === 'INELIGIBLE' && 'Ineligible Based on Published Criteria'}
                    {eligibility_classification === 'INSUFFICIENT_INFORMATION' && 'Insufficient Requirements Information'}
                  </div>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {eligibility_explanation || 'Mandatory published requirements deterministically evaluated against candidate academic profile.'}
                </div>
              </div>

              <div style={{ marginBottom: '12px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Requirement-by-Requirement Evidence Breakdown:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {eligibility_reasons.length === 0 ? (
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    No explicit eligibility constraints detected or profile incomplete.
                  </div>
                ) : (
                  eligibility_reasons.map((r, i) => {
                    const isPass = r.status === 'pass'
                    const isFail = r.status === 'fail'
                    const isUnknown = r.status === 'unknown'
                    return (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          gap: '12px',
                          padding: '12px 16px',
                          borderRadius: '8px',
                          background: isPass ? 'rgba(16, 185, 129, 0.08)' : (isFail ? 'rgba(239, 68, 68, 0.08)' : (isUnknown ? 'rgba(245, 166, 35, 0.08)' : 'var(--bg-app)')),
                          border: `1px solid ${isPass ? '#10b981' : (isFail ? '#ef4444' : (isUnknown ? '#f5a623' : 'var(--border)'))}`,
                          alignItems: 'flex-start',
                        }}
                      >
                        <span style={{ fontSize: '16px' }}>
                          {isPass ? '✅' : (isFail ? '❌' : (isUnknown ? '⚠️' : 'ℹ️'))}
                        </span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '13px', textTransform: 'capitalize', color: 'var(--text-primary)' }}>
                            {r.field.replace(/_/g, ' ')}
                            <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>
                              ({isPass ? 'Satisfied' : (isFail ? 'Not Satisfied' : (isUnknown ? 'Action Needed / Unverified' : 'Informational'))})
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {r.detail}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 3: RECRUITMENT CYCLES & PREDICTIONS */}
          {activeTab === 'history' && (
            <div>
              {/* Statistical Prediction Card */}
              {prediction && (
                <div
                  style={{
                    padding: '16px',
                    borderRadius: '10px',
                    background: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid #3b82f6',
                    marginBottom: '20px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>
                      Historical Recruitment Window Estimate
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: '#3b82f6', color: '#fff' }}>
                      {prediction.confidence} Confidence
                    </span>
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {prediction.estimated_open_window || 'No confirmed historical window yet'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {prediction.evidence_basis}
                  </div>
                </div>
              )}

              {/* Cycles Table */}
              <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '10px' }}>
                Observed Previous Recruitment Cycles
              </h4>
              {cycles.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  No historical cycle records verified yet for this company. Compass will record observations as cycles open.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                        <th style={{ padding: '8px' }}>Cycle Year</th>
                        <th style={{ padding: '8px' }}>Observed Open</th>
                        <th style={{ padding: '8px' }}>Observed Close</th>
                        <th style={{ padding: '8px' }}>Type</th>
                        <th style={{ padding: '8px' }}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cycles.map((c, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                          <td style={{ padding: '8px', fontWeight: 600 }}>{c.cycle_year}</td>
                          <td style={{ padding: '8px' }}>{c.observed_open_date || 'N/A'}</td>
                          <td style={{ padding: '8px' }}>{c.observed_close_date || 'N/A'}</td>
                          <td style={{ padding: '8px', textTransform: 'capitalize' }}>{c.observation_type}</td>
                          <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{c.notes || 'Verified'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: MY APPLICATION TRACKER */}
          {activeTab === 'tracking' && (
            <form onSubmit={handleSaveTracking} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Application Pipeline Status
                </label>
                <select
                  value={appStatus}
                  onChange={e => setAppStatus(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-app)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                >
                  {PIPELINE_STATUSES.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Personal Target Deadline
                </label>
                <input
                  type="date"
                  value={personalDeadline}
                  onChange={e => setPersonalDeadline(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-app)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Private Notes & Preparation Topics
                </label>
                <textarea
                  rows={4}
                  value={privateNotes}
                  onChange={e => setPrivateNotes(e.target.value)}
                  placeholder="Record interview rounds, referral contacts, resume tweaks for this role…"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-app)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="submit"
                  disabled={isSavingApp}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '8px',
                    background: 'var(--brand)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: isSavingApp ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSavingApp ? 'Saving…' : 'Save Application State'}
                </button>
                {saveSuccess && (
                  <span style={{ fontSize: '13px', color: '#10b981', fontWeight: 600 }}>
                    ✓ Application updated successfully!
                  </span>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-app)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          {/* Live Re-check Button */}
          <button
            type="button"
            onClick={() => onVerify(opportunity.id)}
            disabled={isVerifying}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              fontWeight: 500,
              cursor: isVerifying ? 'not-allowed' : 'pointer',
            }}
          >
            <span>{isVerifying ? '⏳' : '🔍'}</span>
            <span>{isVerifying ? 'Verifying Official URL…' : 'Live Re-verify Status'}</span>
          </button>

          {/* Action: Open internal Application Workspace */}
          <button
            type="button"
            onClick={() => {
              onClose()
              if (onApply) onApply(opportunity)
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              background: 'var(--brand)',
              color: '#ffffff',
              border: 'none',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <span>Open Application Workspace</span>
            <span>⚡</span>
          </button>

          {/* Action: Open official application portal */}
          {official_application_url && (
            <a
              href={official_application_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '8px',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                fontSize: '13px',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <span>Employer Portal</span>
              <span>↗</span>
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
