import React from 'react'

export default function ChatHeaderToolbar({
  showHistoryDrawer: _showHistoryDrawer,
  setShowHistoryDrawer,
  pastConversations = [],
  isOnline,
  tone,
  handleToneChange,
  showParkedShelf: _showParkedShelf,
  setShowParkedShelf,
  parkedThoughts = [],
  showContext,
  setShowContext,
  handleRecap,
  handleNewChat,
  isInputDisabled,
}) {
  return (
    <div
      style={{
        padding: '10px 18px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-card)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        gap: '10px',
        overflowX: 'auto',
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Left: History drawer toggle & Live connection indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <button
          id="btn-toggle-history-drawer"
          onClick={() => setShowHistoryDrawer((v) => !v)}
          className="btn-secondary"
          style={{
            padding: '0 14px',
            minHeight: '44px',
            borderRadius: 'var(--radius-btn, 6px)',
            fontSize: '13px',
            fontWeight: '500',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            flexShrink: 0,
          }}
          title="View previous chats, plans, and long-term memory"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
          </svg>
          <span>History & Memory</span>
          {pastConversations.length > 0 && (
            <span
              style={{
                background: 'var(--accent, #f5a623)',
                color: '#1b1a17',
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: 'var(--radius-btn, 6px)',
                fontWeight: '600',
              }}
            >
              {pastConversations.length}
            </span>
          )}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: isOnline ? 'var(--domain-code, #1c8a62)' : 'var(--accent, #f5a623)',
              display: 'inline-block',
            }}
          />
          <span style={{ whiteSpace: 'nowrap' }}>{isOnline ? 'Workspace connected' : 'Connecting…'}</span>
        </div>
      </div>

      {/* Right: Connected memory pill, Context toggle & New Chat */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '0 10px',
            minHeight: '36px',
            borderRadius: 'var(--radius-btn, 6px)',
            background: 'var(--bg-card-soft)',
            border: '1px solid var(--border)',
            fontSize: '11px',
            color: 'var(--text-primary)',
            fontWeight: '600',
          }}
          title="Compass long-term memory is active across sessions to prevent schedule clashes"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--domain-code, #1c8a62)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <rect x="9" y="9" width="6" height="6" />
          </svg>
          <span>Memory Active</span>
        </div>

        {/* Tone Dial: Brief / Balanced / Exploratory */}
        <div
          id="chat-tone-dial"
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-btn, 6px)',
            padding: '2px',
            gap: '2px',
          }}
          title="Adjust assistant response style (Brief, Balanced, Exploratory)"
        >
          {[
            { id: 'brief', label: 'Brief' },
            { id: 'balanced', label: 'Balanced' },
            { id: 'exploratory', label: 'Exploratory' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              id={`btn-tone-${t.id}`}
              onClick={() => handleToneChange(t.id)}
              style={{
                padding: '0 10px',
                minHeight: '40px',
                borderRadius: 'var(--radius-btn, 6px)',
                border: 'none',
                background: tone === t.id ? 'var(--bg-card-soft)' : 'transparent',
                color: tone === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: tone === t.id ? '600' : '400',
                cursor: 'pointer',
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Parked Thoughts Shelf Toggle */}
        <button
          id="btn-toggle-parked"
          type="button"
          onClick={() => setShowParkedShelf((v) => !v)}
          className="btn-secondary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '0 12px',
            minHeight: '44px',
            borderRadius: 'var(--radius-btn, 6px)',
            fontSize: '12px',
            fontWeight: '500',
            cursor: 'pointer',
          }}
          title="Toggle Parked Thoughts Shelf"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="17" x2="12" y2="22" />
            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.77V6a3 3 0 0 0-6 0v4.77a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24Z" />
          </svg>
          <span>Parked ({parkedThoughts.length})</span>
        </button>

        <button
          onClick={() => setShowContext((v) => !v)}
          className="btn-secondary"
          style={{
            padding: '0 12px',
            minHeight: '44px',
            borderRadius: 'var(--radius-btn, 6px)',
            fontSize: '12px',
            fontWeight: '500',
            cursor: 'pointer',
          }}
        >
          {showContext ? 'Hide Context' : 'Show Context'}
        </button>

        <button
          id="btn-chat-recap"
          type="button"
          onClick={handleRecap}
          disabled={isInputDisabled}
          className="btn-secondary"
          style={{
            padding: '0 12px',
            minHeight: '44px',
            borderRadius: 'var(--radius-btn, 6px)',
            fontSize: '12px',
            fontWeight: '500',
            cursor: isInputDisabled ? 'not-allowed' : 'pointer',
            opacity: isInputDisabled ? 0.5 : 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
          title="Summarize decisions made, open questions, and next steps"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <span>Recap</span>
        </button>

        <button
          id="btn-chat-new"
          onClick={handleNewChat}
          disabled={isInputDisabled}
          className="btn-secondary"
          style={{
            padding: '0 14px',
            minHeight: '44px',
            borderRadius: 'var(--radius-btn, 6px)',
            fontSize: '12px',
            fontWeight: '600',
            cursor: isInputDisabled ? 'not-allowed' : 'pointer',
            opacity: isInputDisabled ? 0.5 : 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>New Chat</span>
        </button>
      </div>
    </div>
  )
}
