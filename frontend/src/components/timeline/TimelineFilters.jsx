import React from 'react'
import { Search, X } from 'lucide-react'
import { getDomainMeta } from './domainMeta'

export default function TimelineFilters({
  tasks = [],
  activeDomain,
  onSelectDomain,
  statusFilter,
  setStatusFilter,
  searchQuery,
  setSearchQuery,
}) {
  const basePills = ['all', 'hackathon', 'coursework', 'code', 'general', 'other']
  const customPills = tasks
    .map(t => (t.domain || '').toLowerCase().trim())
    .filter(d => d && !basePills.includes(d))
  const uniquePills = Array.from(new Set([...basePills, ...customPills]))

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '20px',
        flexWrap: 'wrap',
      }}
    >
      {/* Domain Filter Pills */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {uniquePills.map(dom => {
          const pillMeta = dom === 'all' ? { label: 'All Domains' } : getDomainMeta(dom)
          const isSelected = activeDomain === dom
          return (
            <button
              key={dom}
              id={`filter-pill-${dom}`}
              onClick={() => onSelectDomain(dom)}
              className={`filter-pill ${isSelected ? 'active' : ''}`}
              style={{
                padding: '0 14px',
                borderRadius: 'var(--radius-btn, 6px)',
                fontSize: '13px',
                fontWeight: isSelected ? '600' : '400',
                cursor: 'pointer',
                border: '1px solid var(--border)',
                background: isSelected ? 'var(--bg-card-soft)' : 'var(--bg-card)',
                color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                minHeight: '44px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              {dom !== 'all' && pillMeta.color && (
                <span className="domain-swatch" style={{ background: pillMeta.color }} />
              )}
              {pillMeta.label}
            </button>
          )
        })}
      </div>

      {/* Search & Status Filters */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Status Selector */}
        <div
          style={{
            display: 'flex',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-btn, 6px)',
            padding: '2px',
          }}
        >
          {[
            { key: 'all', label: 'All' },
            { key: 'open', label: 'Open' },
            { key: 'urgent', label: 'Urgent' },
            { key: 'completed', label: 'Done' },
          ].map(st => (
            <button
              key={st.key}
              onClick={() => setStatusFilter(st.key)}
              style={{
                padding: '0 12px',
                minHeight: '40px',
                borderRadius: 'var(--radius-btn, 6px)',
                border: 'none',
                fontSize: '13px',
                fontWeight: statusFilter === st.key ? '600' : '400',
                background: statusFilter === st.key ? 'var(--bg-card-soft)' : 'transparent',
                color: statusFilter === st.key ? 'var(--text-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.1s ease',
              }}
            >
              {st.label}
            </button>
          ))}
        </div>

        {/* Search Box */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-btn, 6px)',
            padding: '0 12px',
            minHeight: '44px',
            width: '220px',
            boxSizing: 'border-box',
          }}
        >
          <Search size={15} color="var(--text-secondary)" />
          <input
            type="text"
            placeholder="Search tasks & tags..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              fontSize: '13px',
              color: 'var(--text-primary)',
              width: '100%',
              background: 'transparent',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '13px',
                padding: '4px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Clear search"
              aria-label="Clear search"
            >
              <X size={13} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
