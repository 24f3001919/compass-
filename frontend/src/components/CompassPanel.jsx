import React, { useState, useEffect } from 'react'
import ChatPanel from './ChatPanel'
import AgentPanel from './AgentPanel'
import DarkModeToggle from './DarkModeToggle'
import Logo from './Logo'

export default function CompassPanel({
  initialSubTab = 'assistant',
  messages,
  setMessages,
  conversationId,
  setConversationId,
  onSendMessage,
  isTyping,
  onChatComplete,
  onTaskMutated,
  tasks = [],
  backendStatus = 'Live • Neon Connected',
  onSelectTab: _onSelectTab,
  pendingPrompt,
  onClearPendingPrompt,
  onOpenMigration,
  isDarkMode,
  onToggleDarkMode,
}) {
  const [activeSubTab, setActiveSubTab] = useState(initialSubTab)

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab)
    }
  }, [initialSubTab])

  useEffect(() => {
    if (pendingPrompt) {
      setActiveSubTab('assistant')
    }
  }, [pendingPrompt])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, minWidth: 0, overflow: 'hidden', background: 'var(--bg-app)' }}>
      {/* Header Sub-bar */}
      <div style={{
        minHeight: '52px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-card)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        flexShrink: 0,
        gap: '12px',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <Logo size={20} alt="" />
          <span style={{ fontSize: '20px', fontWeight: '600', color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
            Compass
          </span>
          <span style={{
            fontSize: '11px',
            color: 'var(--text-secondary)',
            background: 'var(--bg-card-soft)',
            border: '1px solid var(--border)',
            padding: '3px 8px',
            borderRadius: 'var(--radius-btn, 6px)',
            whiteSpace: 'nowrap',
            fontWeight: '500',
          }}>
            Assistant & Planner
          </span>
        </div>

        {/* View Toggle */}
        <div style={{ display: 'flex', background: 'var(--bg-card-soft)', padding: '2px', borderRadius: 'var(--radius-btn, 6px)', border: '1px solid var(--border)', flexShrink: 0, gap: '2px' }}>
          <button
            id="compass-subtab-chat"
            onClick={() => setActiveSubTab('assistant')}
            style={{
              padding: '0 14px',
              minHeight: '44px',
              borderRadius: 'var(--radius-btn, 6px)',
              border: 'none',
              background: activeSubTab === 'assistant' ? 'var(--bg-card)' : 'transparent',
              color: activeSubTab === 'assistant' ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: activeSubTab === 'assistant' ? '600' : '400',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>Chat</span>
          </button>
          <button
            id="compass-subtab-planner"
            onClick={() => setActiveSubTab('planner')}
            style={{
              padding: '0 14px',
              minHeight: '44px',
              borderRadius: 'var(--radius-btn, 6px)',
              border: 'none',
              background: activeSubTab === 'planner' ? 'var(--bg-card)' : 'transparent',
              color: activeSubTab === 'planner' ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: activeSubTab === 'planner' ? '600' : '400',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            </svg>
            <span>Planner</span>
          </button>
        </div>
        <DarkModeToggle
          isDarkMode={Boolean(isDarkMode)}
          onToggleDarkMode={onToggleDarkMode}
          id="compass-theme-toggle"
        />
      </div>

      {/* Main Unified View Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {activeSubTab === 'planner' ? (
          <AgentPanel
            onTaskMutated={onTaskMutated}
            conversationId={conversationId}
          />
        ) : (
          <ChatPanel
            messages={messages}
            setMessages={setMessages}
            conversationId={conversationId}
            setConversationId={setConversationId}
            onSendMessage={onSendMessage}
            isTyping={isTyping}
            onChatComplete={onChatComplete}
            tasks={tasks}
            backendStatus={backendStatus}
            initialPrompt={pendingPrompt}
            onClearInitialPrompt={onClearPendingPrompt}
            onOpenMigration={onOpenMigration}
          />
        )}
      </div>
    </div>
  )
}
