import React, { useState, useEffect } from 'react'

export default function ExtractionReviewModal({
  show,
  onClose,
  parseResult,
  onCommit,
  committing = false,
}) {
  const [content, setContent] = useState(null)
  const [activeTab, setActiveTab] = useState('contact') // contact | skills | education | projects | additional

  useEffect(() => {
    if (parseResult?.extracted_content) {
      setContent(JSON.parse(JSON.stringify(parseResult.extracted_content)))
    }
  }, [parseResult])

  if (!show || !content) return null

  const diag = parseResult || {}
  const missing = diag.missing_fields || []
  const ambiguous = diag.ambiguous_fields || []
  const conflicts = diag.field_conflicts || []
  const confidence = diag.field_confidence?.overall || 0.85

  const handleCommit = (target = 'master') => {
    if (onCommit) {
      onCommit(content, diag.original_document_id, target)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '20px',
      }}
    >
      <div
        style={{
          background: 'var(--bg-card, #ffffff)',
          border: '1px solid var(--border, #e2e8f0)',
          borderRadius: '16px',
          maxWidth: '820px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border, #e2e8f0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-card-soft, #f8fafc)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-primary, #0f172a)' }}>
                🔍 Review Extracted Resume Data
              </h3>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  background: confidence >= 0.8 ? '#dcfce7' : '#fef9c3',
                  color: confidence >= 0.8 ? '#166534' : '#854d0e',
                }}
              >
                {Math.round(confidence * 100)}% Confidence
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
              Source: <strong>{diag.filename || 'Uploaded Document'}</strong> ({diag.file_type || 'file'}) — Please verify accuracy before committing.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '18px',
              color: 'var(--text-muted, #64748b)',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* Diagnostics Alerts */}
        {(missing.length > 0 || conflicts.length > 0 || ambiguous.length > 0) && (
          <div style={{ padding: '12px 24px', background: '#fffbeb', borderBottom: '1px solid #fef3c7' }}>
            {missing.length > 0 && (
              <div style={{ fontSize: '12px', color: '#b45309', marginBottom: conflicts.length ? '4px' : '0' }}>
                ⚠️ <strong>Missing Fields:</strong> {missing.join(', ')} — you can complete these below.
              </div>
            )}
            {conflicts.map((conf, idx) => (
              <div key={idx} style={{ fontSize: '12px', color: '#b45309' }}>
                ⚡ <strong>Conflict:</strong> {conf.message} (Selected: {conf.selected})
              </div>
            ))}
            {ambiguous.map((amb, idx) => (
              <div key={idx} style={{ fontSize: '12px', color: '#78350f' }}>
                ℹ️ {amb}
              </div>
            ))}
          </div>
        )}

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border, #e2e8f0)', padding: '0 24px', background: 'var(--bg-card, #ffffff)' }}>
          {[
            { id: 'contact', label: '👤 Contact & Summary' },
            { id: 'skills', label: '🛠️ Technical Skills' },
            { id: 'education', label: '🎓 Education' },
            { id: 'projects', label: '💻 Projects & Internships' },
            { id: 'additional', label: '🏆 Honors & Links' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '12px 14px',
                fontSize: '13px',
                fontWeight: activeTab === tab.id ? '700' : '500',
                color: activeTab === tab.id ? 'var(--primary, #2563eb)' : 'var(--text-muted, #64748b)',
                border: 'none',
                background: 'transparent',
                borderBottom: activeTab === tab.id ? '2px solid var(--primary, #2563eb)' : '2px solid transparent',
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {activeTab === 'contact' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '4px' }}>Full Name</label>
                <input
                  type="text"
                  value={content.full_name || ''}
                  onChange={(e) => setContent({ ...content, full_name: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '4px' }}>Email Address</label>
                <input
                  type="email"
                  value={content.email || ''}
                  onChange={(e) => setContent({ ...content, email: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '4px' }}>Phone Number</label>
                <input
                  type="text"
                  value={content.phone || ''}
                  onChange={(e) => setContent({ ...content, phone: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '4px' }}>Location</label>
                <input
                  type="text"
                  value={content.location || ''}
                  onChange={(e) => setContent({ ...content, location: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '4px' }}>GitHub / Portfolio</label>
                <input
                  type="text"
                  value={content.github_or_portfolio || ''}
                  onChange={(e) => setContent({ ...content, github_or_portfolio: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '4px' }}>LinkedIn Profile</label>
                <input
                  type="text"
                  value={content.linkedin_url || ''}
                  onChange={(e) => setContent({ ...content, linkedin_url: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '4px' }}>Professional Summary</label>
                <textarea
                  value={content.summary || ''}
                  onChange={(e) => setContent({ ...content, summary: e.target.value })}
                  rows={3}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
              </div>
            </div>
          )}

          {activeTab === 'skills' && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Technical Skills (comma-separated)
              </label>
              <textarea
                value={(content.skills || []).join(', ')}
                onChange={(e) =>
                  setContent({
                    ...content,
                    skills: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  })
                }
                rows={5}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px' }}>
                {(content.skills || []).map((s, idx) => (
                  <span
                    key={idx}
                    style={{
                      background: 'var(--bg-card-soft, #f1f5f9)',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      border: '1px solid var(--border)',
                    }}
                  >
                    ✓ {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'education' && (
            <div>
              {(content.education || []).map((edu, idx) => (
                <div key={idx} style={{ background: 'var(--bg-card-soft)', padding: '12px', borderRadius: '8px', marginBottom: '10px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Institution</label>
                      <input
                        type="text"
                        value={edu.institution || ''}
                        onChange={(e) => {
                          const updated = [...content.education]
                          updated[idx].institution = e.target.value
                          setContent({ ...content, education: updated })
                        }}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Degree / Field</label>
                      <input
                        type="text"
                        value={edu.degree || ''}
                        onChange={(e) => {
                          const updated = [...content.education]
                          updated[idx].degree = e.target.value
                          setContent({ ...content, education: updated })
                        }}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)' }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'projects' && (
            <div>
              <h4 style={{ margin: '0 0 10px', fontSize: '13px', color: 'var(--text-muted)' }}>Extracted Technical Projects</h4>
              {(content.projects || []).map((proj, idx) => (
                <div key={idx} style={{ background: 'var(--bg-card-soft)', padding: '12px', borderRadius: '8px', marginBottom: '10px', border: '1px solid var(--border)' }}>
                  <input
                    type="text"
                    value={proj.title || ''}
                    onChange={(e) => {
                      const updated = [...content.projects]
                      updated[idx].title = e.target.value
                      setContent({ ...content, projects: updated })
                    }}
                    style={{ fontWeight: '700', width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '6px' }}
                  />
                  <textarea
                    value={proj.description || ''}
                    onChange={(e) => {
                      const updated = [...content.projects]
                      updated[idx].description = e.target.value
                      setContent({ ...content, projects: updated })
                    }}
                    rows={2}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)' }}
                  />
                </div>
              ))}
            </div>
          )}

          {activeTab === 'additional' && (
            <div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Awards & Achievements
                </label>
                <textarea
                  value={(content.awards || []).join('\n')}
                  onChange={(e) => setContent({ ...content, awards: e.target.value.split('\n').filter(Boolean) })}
                  rows={3}
                  style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Detected Links & Profiles
                </label>
                <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                  {(content.relevant_links || []).map((link, idx) => (
                    <div key={idx} style={{ marginBottom: '4px' }}>
                      🔗 <a href={link} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>{link}</a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border, #e2e8f0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-card-soft, #f8fafc)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              cursor: 'pointer',
              color: 'var(--text-muted)',
            }}
          >
            Cancel
          </button>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={() => handleCommit('draft')}
              disabled={committing}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: committing ? 'wait' : 'pointer',
              }}
            >
              Save as Separate Draft
            </button>
            <button
              type="button"
              onClick={() => handleCommit('master')}
              disabled={committing}
              style={{
                background: 'var(--primary, #2563eb)',
                color: '#fff',
                border: 'none',
                padding: '8px 18px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '700',
                cursor: committing ? 'wait' : 'pointer',
              }}
            >
              {committing ? '⏳ Committing...' : '✓ Commit to Master Profile'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
