import React, { useState, useEffect } from 'react'
import ChatPanel from './ChatPanel'
import AgentPanel from './AgentPanel'
import DarkModeToggle from './DarkModeToggle'
import Logo from './Logo'

export default function NorthstarPanel({
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
      {/* Header Bar - Level 1 */}
      <header
        className="compass-page-header"
        role="banner"
        aria-label="Assistant and planner header"
      >
        <div className="compass-header-left">
          <Logo size={20} alt="Compass Logo" />
          <h1 className="compass-page-title">
            Compass
          </h1>
          <span className="compass-page-badge">
            Assistant & Planner
          </span>
        </div>

        <div className="compass-header-right">
          <div
            role="tablist"
            className="compass-subtab-segmented"
            aria-label="View selection"
          >
            <button
              id="northstar-subtab-chat"
              role="tab"
              aria-selected={activeSubTab === 'assistant'}
              tabIndex={activeSubTab === 'assistant' ? 0 : -1}
              onClick={() => setActiveSubTab('assistant')}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActiveSubTab('planner')
                  document.getElementById('northstar-subtab-planner')?.focus()
                }
              }}
              className={`compass-subtab-btn ${activeSubTab === 'assistant' ? 'active' : ''}`}
              title="Assistant conversation mode"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Chat</span>
            </button>
            <button
              id="northstar-subtab-planner"
              role="tab"
              aria-selected={activeSubTab === 'planner'}
              tabIndex={activeSubTab === 'planner' ? 0 : -1}
              onClick={() => setActiveSubTab('planner')}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActiveSubTab('assistant')
                  document.getElementById('northstar-subtab-chat')?.focus()
                }
              }}
              className={`compass-subtab-btn ${activeSubTab === 'planner' ? 'active' : ''}`}
              title="Multi-step agent planning mode"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              </svg>
              <span>Planner</span>
            </button>
          </div>

          <DarkModeToggle
            isDarkMode={Boolean(isDarkMode)}
            onToggleDarkMode={onToggleDarkMode}
            id="northstar-theme-toggle"
          />
        </div>
      </header>

      {/* Main Unified View Area: Preserves state across tab switching */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: activeSubTab === 'planner' ? 'flex' : 'none', flexDirection: 'column', minWidth: 0, minHeight: 0, height: '100%', overflow: 'hidden' }}>
          <AgentPanel
            onTaskMutated={onTaskMutated}
            conversationId={conversationId}
          />
        </div>
        <div style={{ flex: 1, display: activeSubTab === 'assistant' ? 'flex' : 'none', flexDirection: 'column', minWidth: 0, minHeight: 0, height: '100%', overflow: 'hidden' }}>
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
        </div>
      </div>
    </div>
  )
}
