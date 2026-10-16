import React, { useState } from 'react'

export default function ThinkingBlock({ thought, isLive = false }) {
  const [isOpen, setIsOpen] = useState(isLive)

  if (!thought || !thought.trim()) return null

  return (
    <div style={{
      marginBottom: '10px',
      borderRadius: '10px',
      border: '1px solid var(--border)',
      background: 'var(--bg-card-soft, rgba(0, 0, 0, 0.03))',
      overflow: 'hidden',
      fontSize: '12.5px',
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
          padding: '7px 12px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          fontWeight: '500',
          fontSize: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '13px' }}>🧠</span>
          <span>{isLive ? 'Thinking & reasoning...' : 'Thought process & tool execution'}</span>
          {isLive && (
            <span style={{
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--coursework, #3b82f6)',
              animation: 'pulse 1.5s infinite',
            }} />
          )}
        </div>
        <span style={{
          fontSize: '10px',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
        }}>
          ▼
        </span>
      </button>

      {isOpen && (
        <div style={{
          padding: '8px 12px 12px 12px',
          borderTop: '1px solid var(--border)',
          color: 'var(--text-muted, var(--text-secondary))',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '11.5px',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap',
          maxHeight: '260px',
          overflowY: 'auto',
          background: 'rgba(0, 0, 0, 0.02)',
        }}>
          {thought}
        </div>
      )}
    </div>
  )
}
