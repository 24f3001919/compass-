import React from 'react'

export default function HandoffKitModal({ activeKit, onClose }) {
  if (!activeKit) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          maxWidth: '600px',
          width: '100%',
          padding: '24px',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
            📋 Application Handoff Package
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '15px' }}>
            {activeKit.company_name}: {activeKit.role_title}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Target Deadline: {activeKit.deadline || 'Rolling recruitment'}
          </div>
        </div>

        {/* Missing fields alert */}
        {activeKit.missing_fields && activeKit.missing_fields.length > 0 && (
          <div style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', marginBottom: '16px', fontSize: '12px' }}>
            ⚠️ Notice: Unresolved candidate fields detected: {activeKit.missing_fields.join(', ')}. Please update your profile before final submission.
          </div>
        )}

        {/* Tailored Cover Letter preview */}
        {activeKit.cover_letter && (
          <div style={{ background: 'var(--bg-card-soft)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary)' }}>
                Truthful Tailored Cover Letter:
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(activeKit.cover_letter)
                  alert('Cover letter copied!')
                }}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                📋 Copy Letter
              </button>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', maxHeight: '140px', overflowY: 'auto', fontFamily: 'monospace' }}>
              {activeKit.cover_letter}
            </div>
          </div>
        )}

        <div style={{ background: 'var(--bg-card-soft)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary)', marginBottom: '8px' }}>
            Pre-Filled Candidate Answers (Ready to Paste):
          </div>
          {Object.entries(activeKit.prefilled_answers || {}).map(([key, val], idx) => (
            <div key={idx} style={{ marginBottom: '8px', fontSize: '12px' }}>
              <div style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>{key.replace('_', ' ')}:</div>
              <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginTop: '2px' }}>{val}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
            Submission Steps:
          </div>
          <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--text-muted)' }}>
            {(activeKit.submission_instructions || []).map((step, idx) => (
              <li key={idx} style={{ marginBottom: '4px' }}>{step}</li>
            ))}
          </ol>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <a
            href={activeKit.portal_url}
            target="_blank"
            rel="noreferrer"
            style={{
              background: 'var(--primary)',
              color: '#fff',
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '700',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Open Official Portal ↗
          </a>
        </div>
      </div>
    </div>
  )
}
