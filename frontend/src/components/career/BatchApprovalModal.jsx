import React from 'react'

export default function BatchApprovalModal({
  show,
  onClose,
  currentBatch,
  attestationConfirmed,
  setAttestationConfirmed,
  workAuthConfirmed,
  setWorkAuthConfirmed,
  legalAccepted,
  setLegalAccepted,
  onConfirm,
  processing,
}) {
  if (!show || !currentBatch) return null

  const isFormValid = attestationConfirmed && workAuthConfirmed && legalAccepted && !processing

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
          maxWidth: '680px',
          width: '100%',
          padding: '24px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
          🔒 Explicit Batch Submission Approval
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-muted)' }}>
          Compass enforces strict user authorization before any external application action.
          Review the {currentBatch.total_count} selected opportunities and confirm your attestations.
        </p>

        {/* Opportunities in batch */}
        <div style={{ background: 'var(--bg-card-soft)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '6px' }}>
            Included Applications ({currentBatch.applications.length}):
          </div>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: 'var(--text-primary)' }}>
            {currentBatch.applications.map((a, i) => (
              <li key={i}>
                <strong>{a.opportunity?.company_name || `Opp #${a.opportunity_id}`}</strong> — {a.opportunity?.role_title}
              </li>
            ))}
          </ul>
        </div>

        {/* Mandatory Attestation Checkboxes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={attestationConfirmed}
              onChange={(e) => setAttestationConfirmed(e.target.checked)}
              style={{ marginTop: '2px' }}
            />
            <span>
              <strong>Factual Integrity Attestation:</strong> I attest that all candidate qualifications, degree dates, and resume statements in this batch are truthful and verified.
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={workAuthConfirmed}
              onChange={(e) => setWorkAuthConfirmed(e.target.checked)}
              style={{ marginTop: '2px' }}
            />
            <span>
              <strong>Work Authorization:</strong> I confirm my eligibility to undertake these internships in India / remotely.
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={legalAccepted}
              onChange={(e) => setLegalAccepted(e.target.checked)}
              style={{ marginTop: '2px' }}
            />
            <span>
              <strong>Legal Acceptance:</strong> I authorize Compass to prepare and package these applications for submission under my explicit instruction.
            </span>
          </label>
        </div>

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
            onClick={onConfirm}
            disabled={!isFormValid}
            style={{
              background: !isFormValid ? '#94a3b8' : 'var(--primary)',
              color: '#fff',
              border: 'none',
              padding: '8px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '700',
              cursor: !isFormValid ? 'not-allowed' : 'pointer',
            }}
          >
            {processing ? 'Processing...' : 'Authorize & Submit Batch'}
          </button>
        </div>
      </div>
    </div>
  )
}
