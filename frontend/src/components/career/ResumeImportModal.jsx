import React from 'react'

export default function ResumeImportModal({
  show,
  onClose,
  importText,
  setImportText,
  onImport,
  importing,
  importSuccess,
}) {
  if (!show) return null

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
          maxWidth: '620px',
          width: '100%',
          padding: '24px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
            📥 Import / Paste Resume Text
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-muted)' }}>
          Paste your raw resume text below. Compass will extract structured candidate fields (name, email, phone, location, skills) without hallucinating unverified qualifications.
        </p>

        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={10}
          placeholder="Paste raw resume text here (e.g. from PDF, Word, or plain text)..."
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
            marginBottom: '16px',
          }}
        />

        {importSuccess && (
          <div style={{ background: '#dcfce7', color: '#166534', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
            ✓ Structured resume extracted successfully! Populating profile fields...
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onImport}
            disabled={!importText.trim() || importing}
            style={{
              background: (!importText.trim() || importing) ? '#94a3b8' : 'var(--primary)',
              color: '#fff',
              border: 'none',
              padding: '8px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '700',
              cursor: (!importText.trim() || importing) ? 'not-allowed' : 'pointer',
            }}
          >
            {importing ? 'Extracting...' : 'Extract & Populate Profile'}
          </button>
        </div>
      </div>
    </div>
  )
}
