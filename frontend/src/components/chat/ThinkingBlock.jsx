import React, { useState, useMemo } from 'react'

/**
 * Sanitizes input into clean, safe user-facing activity milestones.
 * Strips raw model scratchpads, internal prompts, and raw JSON arguments.
 */
function sanitizeActivityMilestones(rawText) {
  if (!rawText || typeof rawText !== 'string') return []

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
  const milestones = []

  for (const line of lines) {
    const lower = line.toLowerCase()

    // 1. Filter out private scratchpads / internal prompt fragments
    if (
      lower.startsWith('however,') ||
      lower.startsWith('but maybe') ||
      lower.startsWith('let\'s ') ||
      lower.startsWith('lets ') ||
      lower.startsWith('we have ') ||
      lower.startsWith('i should ') ||
      lower.startsWith('i need to ') ||
      lower.includes('chain-of-thought') ||
      lower.includes('internal prompt') ||
      lower.includes('secret') ||
      lower.includes('token')
    ) {
      continue
    }

    // 2. Map tool act calls into clean user-facing milestones
    if (lower.startsWith('tool:') || lower.startsWith('executing')) {
      if (lower.includes('task') || lower.includes('deadline') || lower.includes('coursework') || lower.includes('hackathon')) {
        milestones.push('Retrieving relevant tasks & deadlines')
      } else if (lower.includes('schedule') || lower.includes('calendar') || lower.includes('feasibility') || lower.includes('conflict')) {
        milestones.push('Checking upcoming deadlines & schedule')
      } else if (lower.includes('web')) {
        milestones.push('Searching reference documentation')
      } else if (lower.includes('note') || lower.includes('code') || lower.includes('context') || lower.includes('project')) {
        milestones.push('Reviewing relevant context')
      } else {
        milestones.push('Executing action')
      }
      continue
    }

    // 3. Map critic / verification
    if (lower.includes('critic') || lower.includes('verify')) {
      milestones.push('Verifying plan constraints')
      continue
    }

    // 4. Clean "Thinking:" prefix
    if (lower.startsWith('thinking:')) {
      const rest = line.substring(9).trim()
      milestones.push(rest || 'Understanding your request')
      continue
    }

    // 5. If it's a clean known milestone or short safe label
    if (
      lower.includes('understanding') ||
      lower.includes('retrieving') ||
      lower.includes('checking') ||
      lower.includes('reviewing') ||
      lower.includes('preparing') ||
      lower.includes('analysis complete') ||
      lower.includes('analyz')
    ) {
      milestones.push(line.replace(/^[•\-\*]\s*/, '').trim())
      continue
    }

    // 6. Generic "Thinking..."
    if (lower === 'thinking...' || lower === 'thinking') {
      milestones.push('Understanding your request')
      continue
    }
  }

  // Deduplicate consecutive identical milestones
  const deduped = []
  for (const m of milestones) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== m) {
      deduped.push(m)
    }
  }

  return deduped
}

/**
 * Polished, user-facing Activity Indicator component.
 * Replaces raw chain-of-thought and tool parameter dumps with a clean status pill
 * and optional expandable milestone checklist.
 */
export default function ThinkingBlock({ thought, isLive = false }) {
  const [isOpen, setIsOpen] = useState(false)

  const milestones = useMemo(() => sanitizeActivityMilestones(thought), [thought])

  if (!milestones || milestones.length === 0) {
    if (!isLive) return null
    return (
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 9px',
        borderRadius: '12px',
        background: 'var(--bg-card-soft, rgba(0, 0, 0, 0.04))',
        border: '1px solid var(--border)',
        fontSize: '11.5px',
        color: 'var(--text-secondary)',
        marginBottom: '8px',
      }}>
        <span style={{
          display: 'inline-block',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: 'var(--coursework, #3b82f6)',
          animation: 'pulse 1.5s infinite',
        }} />
        <span>Understanding your request…</span>
      </div>
    )
  }

  const latestMilestone = milestones[milestones.length - 1]

  return (
    <div style={{
      marginBottom: '10px',
      borderRadius: '8px',
      border: '1px solid var(--border)',
      background: 'var(--bg-card-soft, rgba(0, 0, 0, 0.03))',
      overflow: 'hidden',
      fontSize: '12px',
      transition: 'all 0.2s ease',
    }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          fontWeight: '500',
          fontSize: '11.5px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isLive ? (
            <span style={{
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--coursework, #3b82f6)',
              animation: 'pulse 1.5s infinite',
            }} />
          ) : (
            <span style={{ color: 'var(--coursework, #3b82f6)', fontSize: '11px' }}>✦</span>
          )}
          <span>
            {isLive ? `${latestMilestone}…` : `Activity: ${milestones.length} step${milestones.length > 1 ? 's' : ''} completed`}
          </span>
        </div>
        <span style={{
          fontSize: '9px',
          color: 'var(--text-muted)',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
        }}>
          ▼
        </span>
      </button>

      {isOpen && (
        <div style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--border-soft, rgba(0, 0, 0, 0.06))',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          background: 'var(--bg-card, rgba(0, 0, 0, 0.01))',
        }}>
          {milestones.map((m, idx) => {
            const isLast = idx === milestones.length - 1 && isLive
            return (
              <div key={idx} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                fontSize: '11.5px',
                color: isLast ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}>
                <span style={{
                  color: isLast ? 'var(--coursework, #3b82f6)' : 'var(--success, #10b981)',
                  fontWeight: '600',
                  fontSize: '10px',
                }}>
                  {isLast ? '●' : '✓'}
                </span>
                <span>{m}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
