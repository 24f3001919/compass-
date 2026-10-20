import React from 'react'

export default function ChatContextBar({
  overdueCount = 0,
  taskCount = 0,
  isOnline = false,
  backendStatus = '',
}) {
  return (
    <div style={{
      display: 'flex', gap: '10px', padding: '12px 20px', borderBottom: '1px solid var(--border)',
      background: 'var(--bg-card)', flexShrink: 0, flexWrap: 'wrap'
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: 'var(--radius-card, 8px)',
        background: 'var(--bg-card-soft)', border: '1px solid var(--border)', minWidth: '170px'
      }}>
        {overdueCount > 0 ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--domain-code, #1c8a62)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        <div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: overdueCount > 0 ? '#ef4444' : 'var(--text-primary)' }}>
            {overdueCount > 0 ? `${overdueCount} overdue` : 'On schedule'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Across all domains</div>
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: 'var(--radius-card, 8px)',
        background: 'var(--bg-card-soft)', border: '1px solid var(--border)', minWidth: '170px'
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--domain-coursework, #2f64c8)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
        </svg>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
            {taskCount} task{taskCount === 1 ? '' : 's'} tracked
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Live in Neon</div>
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: 'var(--radius-card, 8px)',
        background: 'var(--bg-card-soft)', border: '1px solid var(--border)', minWidth: '170px'
      }}>
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: isOnline ? 'var(--domain-code, #1c8a62)' : 'var(--accent, #f5a623)',
            display: 'inline-block',
          }}
        />
        <div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
            {isOnline ? 'Backend live' : 'Backend offline'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{backendStatus}</div>
        </div>
      </div>
    </div>
  )
}
