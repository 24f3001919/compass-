import React from 'react'

export default function RadarOpportunityCard({
  opportunity,
  onOpenDetail,
  onToggleSave,
  onUpdateAppStatus,
}) {
  const {
    id,
    company_name,
    role_title,
    location,
    work_arrangement,
    category,
    current_status,
    eligibility_classification,
    eligibility_explanation,
    official_application_url,
    prediction,
    is_saved,
    application_status,
    last_verified_at,
    is_india_eligible,
    compensation,
  } = opportunity

  // Status Badge Colors & Labels
  const getStatusBadge = () => {
    switch (current_status) {
      case 'OPEN_CONFIRMED':
        return { label: 'Verified Open', bg: 'rgba(16, 185, 129, 0.15)', text: '#059669', border: '#10b981' }
      case 'UPCOMING_CONFIRMED':
      case 'ANNOUNCED':
        return { label: 'Upcoming Confirmed', bg: 'rgba(59, 130, 246, 0.15)', text: '#2563eb', border: '#3b82f6' }
      case 'CLOSED_CONFIRMED':
        return { label: 'Closed', bg: 'rgba(156, 163, 175, 0.15)', text: '#6b7280', border: '#9ca3af' }
      default:
        return { label: 'Needs Verification', bg: 'rgba(168, 85, 247, 0.15)', text: '#9333ea', border: '#a855f7' }
    }
  }

  // Eligibility Pill
  const getEligibilityBadge = () => {
    switch (eligibility_classification) {
      case 'ELIGIBLE':
        return { label: 'Eligible', bg: '#dcfce7', text: '#166534' }
      case 'POTENTIAL_MATCH':
        return { label: 'Potential Match', bg: '#fef3c7', text: '#92400e' }
      case 'INELIGIBLE':
        return { label: 'Ineligible', bg: '#fee2e2', text: '#991b1b' }
      default:
        return { label: 'Verify Criteria', bg: '#f1f5f9', text: '#475569' }
    }
  }

  const statusBadge = getStatusBadge()
  const eligBadge = getEligibilityBadge()

  // Format date
  const formattedVerified = last_verified_at
    ? new Date(last_verified_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '14px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
        padding: '20px',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
        position: 'relative',
        boxSizing: 'border-box',
      }}
    >
      {/* Top Meta Line: Badges & Bookmark */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Status Badge */}
          <span
            style={{
              padding: '3px 10px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.3px',
              background: statusBadge.bg,
              color: statusBadge.text,
              border: `1px solid ${statusBadge.border}`,
            }}
          >
            ● {statusBadge.label}
          </span>

          {/* Eligibility Pill */}
          <span
            style={{
              padding: '3px 10px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 600,
              background: eligBadge.bg,
              color: eligBadge.text,
            }}
            title={eligibility_explanation || ''}
          >
            {eligBadge.label}
          </span>

          {/* India Eligible Tag */}
          {is_india_eligible && (
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(245, 166, 35, 0.12)',
                color: 'var(--brand-dark)',
                fontWeight: 600,
              }}
            >
              🇮🇳 India Student Eligible
            </span>
          )}
        </div>

        {/* Bookmark Button */}
        <button
          type="button"
          onClick={() => onToggleSave(id, is_saved)}
          title={is_saved ? 'Remove from Watchlist' : 'Add to Watchlist'}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '18px',
            padding: '4px',
            lineHeight: 1,
            color: is_saved ? 'var(--brand)' : 'var(--text-muted)',
            transition: 'transform 0.1s ease',
          }}
        >
          {is_saved ? '★' : '☆'}
        </button>
      </div>

      {/* Role & Company Header */}
      <div style={{ marginBottom: '10px' }}>
        <h3
          style={{
            fontSize: '17px',
            fontWeight: 700,
            color: 'var(--text-primary)',
            margin: '0 0 4px 0',
            lineHeight: 1.3,
          }}
        >
          {role_title}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>
          <span>{company_name}</span>
          <span>•</span>
          <span style={{ textTransform: 'capitalize' }}>{work_arrangement}</span>
          {location && (
            <>
              <span>•</span>
              <span style={{ fontSize: '13px' }}>{location}</span>
            </>
          )}
        </div>
      </div>

      {/* Compensation & Duration Snippet */}
      {compensation && (
        <div style={{ fontSize: '12px', color: '#10b981', fontWeight: 600, marginBottom: '8px' }}>
          💰 {compensation}
        </div>
      )}

      {/* Eligibility Explanation */}
      {eligibility_explanation && (
        <div
          style={{
            fontSize: '12px',
            color: 'var(--text-secondary)',
            background: 'var(--bg-app)',
            padding: '8px 12px',
            borderRadius: '8px',
            marginBottom: '12px',
            lineHeight: 1.4,
            borderLeft: `3px solid ${eligBadge.text}`,
          }}
        >
          {eligibility_explanation}
        </div>
      )}

      {/* Predictive Cycle Forecast Notice (if not open) */}
      {current_status !== 'OPEN_CONFIRMED' && prediction?.estimated_open_window && (
        <div
          style={{
            fontSize: '11px',
            color: '#2563eb',
            background: 'rgba(59, 130, 246, 0.08)',
            padding: '6px 10px',
            borderRadius: '6px',
            marginBottom: '12px',
          }}
        >
          📅 <strong>Historical Window:</strong> {prediction.estimated_open_window} ({prediction.confidence} Confidence)
        </div>
      )}

      {/* Tracking Pipeline Status (if user is tracking) */}
      {application_status && (
        <div
          style={{
            fontSize: '12px',
            color: 'var(--brand-dark)',
            fontWeight: 600,
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>📌 Pipeline State:</span>
          <span style={{ textTransform: 'capitalize', background: 'rgba(245, 166, 35, 0.15)', padding: '2px 8px', borderRadius: '4px' }}>
            {application_status.replace(/_/g, ' ')}
          </span>
        </div>
      )}

      {/* Card Footer Actions */}
      <div
        style={{
          marginTop: 'auto',
          paddingTop: '14px',
          borderTop: '1px solid var(--border-soft)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {formattedVerified ? `Verified ${formattedVerified}` : 'Discovered'}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Details & History Button */}
          <button
            type="button"
            onClick={() => onOpenDetail(opportunity)}
            style={{
              padding: '6px 12px',
              borderRadius: '7px',
              border: '1px solid var(--border)',
              background: 'var(--bg-app)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Details & History
          </button>

          {/* Official Apply Link Button */}
          {official_application_url ? (
            <a
              href={official_application_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 14px',
                borderRadius: '7px',
                background: current_status === 'OPEN_CONFIRMED' ? 'var(--brand)' : 'var(--bg-card)',
                color: current_status === 'OPEN_CONFIRMED' ? '#ffffff' : 'var(--text-primary)',
                border: current_status === 'OPEN_CONFIRMED' ? 'none' : '1px solid var(--border)',
                fontSize: '12px',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <span>{current_status === 'OPEN_CONFIRMED' ? 'Apply Now' : 'Official Portal'}</span>
              <span>↗</span>
            </a>
          ) : (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No link yet</span>
          )}
        </div>
      </div>
    </div>
  )
}
