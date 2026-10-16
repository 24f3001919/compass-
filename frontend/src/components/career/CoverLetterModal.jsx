import React from 'react'

export default function CoverLetterModal({
  activeLetterApp,
  onClose,
  onSave,
}) {
  if (!activeLetterApp) return null

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
          maxWidth: '650px',
          width: '100%',
          padding: '24px',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
              ✍️ Tailored Cover Letter
            </h3>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {activeLetterApp.opportunity?.company_name} — {activeLetterApp.opportunity?.role_title}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        <textarea
          defaultValue={activeLetterApp.cover_letter || ''}
          id={`cover_letter_input_${activeLetterApp.id}`}
          rows={14}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--bg-card-soft)',
            color: 'var(--text-primary)',
            boxSizing: 'border-box',
            fontSize: '13px',
            lineHeight: '1.5',
            fontFamily: 'monospace',
            marginBottom: '16px',
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            type="button"
            onClick={() => {
              const val = document.getElementById(`cover_letter_input_${activeLetterApp.id}`)?.value
              if (val) {
                navigator.clipboard?.writeText(val)
                alert('Cover letter copied!')
              }
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
            📋 Copy
          </button>
          <button
            type="button"
            onClick={() => {
              const val = document.getElementById(`cover_letter_input_${activeLetterApp.id}`)?.value
              if (val !== undefined) {
                onSave(activeLetterApp.id, val)
              }
            }}
            style={{
              background: 'var(--primary)',
              color: '#fff',
              border: 'none',
              padding: '8px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '700',
              cursor: 'pointer',
            }}
          >
            Save Cover Letter
          </button>
        </div>
      </div>
    </div>
  )
}
