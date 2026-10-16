import React from 'react'

export default function ValidationReportCard({ validationReport }) {
  if (!validationReport) return null

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>
          🛡️ Factual Audit Report
        </h3>
        <span
          style={{
            fontSize: '12px',
            fontWeight: '800',
            padding: '3px 10px',
            borderRadius: '12px',
            background: validationReport.is_valid ? '#dcfce7' : '#fee2e2',
            color: validationReport.is_valid ? '#166534' : '#991b1b',
          }}
        >
          {validationReport.is_valid ? 'VERIFIED ACCURATE' : 'AUDIT FAILED'}
        </span>
      </div>

      {/* Unsupported Claims Alert */}
      {validationReport.unsupported_claims && validationReport.unsupported_claims.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
          <div style={{ fontWeight: '700', color: '#991b1b', fontSize: '12px', marginBottom: '4px' }}>
            ⚠️ Blocked Unsupported Claims:
          </div>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#b91c1c' }}>
            {validationReport.unsupported_claims.map((claim, idx) => (
              <li key={idx}>{claim}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Tailored alignments */}
      {validationReport.tailored_alignments && validationReport.tailored_alignments.length > 0 && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
          <div style={{ fontWeight: '700', color: '#166534', fontSize: '12px', marginBottom: '4px' }}>
            🎯 Verified Role Alignments:
          </div>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#15803d' }}>
            {validationReport.tailored_alignments.map((align, idx) => (
              <li key={idx}>{align}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Passed checklist */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {(validationReport.passed_checks || []).map((p, idx) => (
          <div key={idx} style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#10b981' }}>✓</span> {p}
          </div>
        ))}
      </div>
    </div>
  )
}
