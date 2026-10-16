import React from 'react'

const CATEGORIES = [
  { id: '', label: 'All Roles' },
  { id: 'ai_ml', label: 'AI & Machine Learning' },
  { id: 'swe', label: 'Software Engineering' },
  { id: 'backend', label: 'Backend & Systems' },
  { id: 'research', label: 'Research & Labs' },
  { id: 'data', label: 'Data Science' },
  { id: 'cloud', label: 'Cloud & Infrastructure' },
]

const TABS = [
  { id: 'recommended', label: 'Recommended for You', icon: '✨' },
  { id: 'open', label: 'Open Now', icon: '🟢' },
  { id: 'upcoming', label: 'Opening Soon', icon: '⏱️' },
  { id: 'all', label: 'All Listings', icon: '📑' },
  { id: 'watchlist', label: 'Watchlist', icon: '⭐' },
  { id: 'applications', label: 'Application Tracker', icon: '📋' },
]

export default function RadarFilters({
  activeTab,
  onSelectTab,
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  indiaOnly,
  onToggleIndiaOnly,
  workArrangement,
  onWorkArrangementChange,
  onOpenProfile,
  onSync,
  isSyncing,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
      {/* Top Tabs Bar */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '4px',
          borderBottom: '1px solid var(--border)',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {TABS.map(tab => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '8px 8px 0 0',
                border: 'none',
                background: isActive ? 'var(--bg-card)' : 'transparent',
                color: isActive ? 'var(--brand)' : 'var(--text-secondary)',
                fontWeight: isActive ? 600 : 500,
                fontSize: '14px',
                cursor: 'pointer',
                borderBottom: isActive ? '2px solid var(--brand)' : '2px solid transparent',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Filter and Action Controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Search Bar */}
        <div style={{ flex: '1 1 240px', minWidth: '220px', position: 'relative' }}>
          <input
            type="text"
            placeholder="Search company, role title, keyword…"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px 10px 36px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              fontSize: '14px',
            }}
          >
            🔍
          </span>
        </div>

        {/* Category Selector */}
        <select
          value={selectedCategory}
          onChange={e => onCategoryChange(e.target.value)}
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            fontSize: '13px',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          {CATEGORIES.map(c => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        {/* Work Arrangement Selector */}
        <select
          value={workArrangement}
          onChange={e => onWorkArrangementChange(e.target.value)}
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            fontSize: '13px',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="">All Arrangements</option>
          <option value="remote">Remote Only</option>
          <option value="hybrid">Hybrid</option>
          <option value="onsite">Onsite</option>
        </select>

        {/* India Eligible Toggle */}
        <button
          type="button"
          onClick={onToggleIndiaOnly}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 14px',
            borderRadius: '8px',
            border: indiaOnly ? '1px solid #10b981' : '1px solid var(--border)',
            background: indiaOnly ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-card)',
            color: indiaOnly ? '#059669' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          <span>🇮🇳</span>
          <span>India Priority</span>
          <span style={{ fontSize: '11px', opacity: 0.8 }}>{indiaOnly ? 'ON' : 'OFF'}</span>
        </button>

        {/* Right buttons: Profile + Sync */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={onOpenProfile}
            title="Configure academic degree, year, and preferences"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <span>⚙️</span>
            <span>Profile</span>
          </button>

          <button
            type="button"
            onClick={onSync}
            disabled={isSyncing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 14px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--brand)',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: isSyncing ? 'not-allowed' : 'pointer',
              opacity: isSyncing ? 0.7 : 1,
            }}
          >
            <span>{isSyncing ? '⏳' : '🔄'}</span>
            <span>{isSyncing ? 'Syncing…' : 'Sync Sources'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
