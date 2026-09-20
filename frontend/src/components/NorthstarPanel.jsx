import React, { useState } from 'react'
import ChatPanel from './ChatPanel'
import AgentPanel from './AgentPanel'

export default function NorthstarPanel({
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
}) {
  const [activeSubTab, setActiveSubTab] = useState('assistant') // 'assistant' | 'planner'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', minWidth: 0, overflow: 'hidden', background: 'var(--bg-app)' }}>
      {/* Northstar Header Sub-bar */}
      <div style={{
        height: '48px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-card)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>🧭</span>
          <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.2px' }}>
            Northstar
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-card-soft)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: '10px' }}>
            Main AI Assistant & Execution Engine
          </span>
        </div>

        {/* View Toggle */}
        <div style={{ display: 'flex', background: 'var(--bg-card-soft)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <button
            id="northstar-subtab-chat"
            onClick={() => setActiveSubTab('assistant')}
            style={{
              padding: '4px 12px',
              borderRadius: '6px',
              border: 'none',
              background: activeSubTab === 'assistant' ? 'var(--bg-card)' : 'transparent',
              color: activeSubTab === 'assistant' ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: activeSubTab === 'assistant' ? 'var(--shadow-sm)' : 'none',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}>
            💬 Conversational Chat
          </button>
          <button
            id="northstar-subtab-planner"
            onClick={() => setActiveSubTab('planner')}
            style={{
              padding: '4px 12px',
              borderRadius: '6px',
              border: 'none',
              background: activeSubTab === 'planner' ? 'var(--bg-card)' : 'transparent',
              color: activeSubTab === 'planner' ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: activeSubTab === 'planner' ? 'var(--shadow-sm)' : 'none',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}>
            🧠 Agent Planner & ReAct Traces
          </button>
        </div>
      </div>

      {/* Main Unified View Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {activeSubTab === 'assistant' ? (
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
          />
        ) : (
          <AgentPanel
            onTaskMutated={onTaskMutated}
            conversationId={conversationId}
          />
        )}
      </div>
    </div>
  )
}
