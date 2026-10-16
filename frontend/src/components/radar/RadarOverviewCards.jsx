import React from 'react'

export default function RadarOverviewCards({
  stats,
  profile,
  onOpenProfile,
  onSelectTab,
  onSync,
  isSyncing,
}) {
  const missingProfileFields = profile?.missing_fields_limiting_eligibility || []
  const hasIncompleteProfile = missingProfileFields.includes('academic_year') || missingProfileFields.includes('grad_year')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
      {hasIncompleteProfile && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            borderRadius: '12px',
            background: 'rgba(245, 166, 35, 0.12)',
            border: '1px solid rgba(245, 166, 35, 0.35)',
            color: 'var(--text-primary)',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>🎯</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>
                Complete your Academic Profile for Deterministic Eligibility
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Set your academic year and target graduation year to filter verified eligible internships.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenProfile}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              background: 'var(--brand)',
              color: '#ffffff',
              border: 'none',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Configure Profile
          </button>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '14px',
        }}
      >
        {/* 1. Verified Open */}
        <div
          onClick={() => onSelectTab('open')}
          style={{
            padding: '16px',
            borderRadius: '12px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer',
            transition: 'transform 0.15s ease, border-color 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Verified Open
            </span>
            <span style={{ color: '#10b981', fontSize: '16px' }}>●</span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {stats?.verified_open_count ?? 0}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Live applications confirmed
          </div>
        </div>

        {/* 2. Strong Matches */}
        <div
          onClick={() => onSelectTab('recommended')}
          style={{
            padding: '16px',
            borderRadius: '12px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Eligible Matches
            </span>
            <span style={{ color: 'var(--brand)', fontSize: '16px' }}>✨</span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {stats?.strong_matches_count ?? 0}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Satisfies your academic criteria
          </div>
        </div>

        {/* 3. Opening Soon */}
        <div
          onClick={() => onSelectTab('upcoming')}
          style={{
            padding: '16px',
            borderRadius: '12px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Opening Soon
            </span>
            <span style={{ color: '#3b82f6', fontSize: '16px' }}>⏱️</span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {stats?.opening_soon_count ?? 0}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Upcoming & cycle forecasts
          </div>
        </div>

        {/* 4. Watchlist */}
        <div
          onClick={() => onSelectTab('watchlist')}
          style={{
            padding: '16px',
            borderRadius: '12px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Watchlist
            </span>
            <span style={{ color: '#8b5cf6', fontSize: '16px' }}>⭐</span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {stats?.saved_count ?? 0}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Saved opportunities
          </div>
        </div>

        {/* 5. In Progress Applications */}
        <div
          onClick={() => onSelectTab('applications')}
          style={{
            padding: '16px',
            borderRadius: '12px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Applications
            </span>
            <span style={{ color: '#ec4899', fontSize: '16px' }}>📋</span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {stats?.applications_in_progress_count ?? 0}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Active tracker pipeline
          </div>
        </div>
      </div>
    </div>
  )
}
