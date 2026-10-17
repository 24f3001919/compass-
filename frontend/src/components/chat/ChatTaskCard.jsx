import React from 'react'

/**
 * Compact, accessible task card for structured task records in chat.
 */
export default function ChatTaskCard({ task, onAction }) {
  if (!task) return null

  const title = task.title || 'Untitled Task'
  const domain = (task.domain || 'general').toLowerCase()
  const status = (task.status || 'open').toLowerCase()
  const priority = (task.priority || 'medium').toLowerCase()
  const dueDate = task.due_date || 'No due date'

  const domainBadgeColor = domain === 'coursework'
    ? 'var(--coursework, #3b82f6)'
    : domain === 'hackathon'
    ? 'var(--hackathon, #a855f7)'
    : 'var(--text-secondary)'

  const statusBadgeBg = status === 'done'
    ? 'rgba(16, 185, 129, 0.12)'
    : status === 'in_progress'
    ? 'rgba(59, 130, 246, 0.12)'
    : 'rgba(0, 0, 0, 0.05)'

  const statusBadgeColor = status === 'done'
    ? 'var(--success, #10b981)'
    : status === 'in_progress'
    ? 'var(--coursework, #3b82f6)'
    : 'var(--text-secondary)'

  return (
    <div style={{
      marginTop: '8px',
      marginBottom: '6px',
      padding: '10px 14px',
      borderRadius: '10px',
      border: '1px solid var(--border)',
      background: 'var(--bg-card-soft, rgba(0, 0, 0, 0.02))',
      fontSize: '12.5px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04))',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <strong style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '13px' }}>
          {title}
        </strong>
        <span style={{
          padding: '2px 7px',
          borderRadius: '12px',
          fontSize: '10.5px',
          fontWeight: '500',
          background: statusBadgeBg,
          color: statusBadgeColor,
          textTransform: 'capitalize',
        }}>
          {status.replace('_', ' ')}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)', fontSize: '11.5px', flexWrap: 'wrap' }}>
        <span style={{ color: domainBadgeColor, fontWeight: '500' }}>
          {domain.toUpperCase()}
        </span>
        <span>•</span>
        <span>Due: {dueDate}</span>
        <span>•</span>
        <span style={{ textTransform: 'capitalize' }}>Priority: {priority}</span>
      </div>

      {onAction && (
        <div style={{ marginTop: '4px', display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => onAction('view_timeline', task)}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '3px 8px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            View in Timeline
          </button>
        </div>
      )}
    </div>
  )
}
