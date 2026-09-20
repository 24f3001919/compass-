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
}) {
  const [activeSubTab, setActiveSubTab] = useState('assistant') // 'assistant' | 'planner'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', minWidth: 0, overflow: 'hidden' }}>
      {/* Northstar Header Sub-bar */}
      <div style={{
        height: '46px',
        borderBottom: '1px solid #1e293b',
        background: '#0d131f',
        display: 'flex',
        alignItems: 'center',
        justify: 'space-between',
        padding: '0 20px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>🧭</span>
          <span style={{ fontSize: '13px', fontWeight: '800', color: '#f8fafc', letterSpacing: '-0.2px' }}>
            Northstar
          </span>
          <span style={{ fontSize: '11px', color: '#64748b', background: 'rgba(30, 41, 59, 0.6)', padding: '2px 8px', borderRadius: '10px' }}>
            Main AI Assistant & Execution Engine
          </span>
        </div>

        {/* View Toggle */}
        <div style={{ display: 'flex', background: '#0b0f17', padding: '3px', borderRadius: '8px', border: '1px solid #1e293b' }}>
          <button
            id="northstar-subtab-chat"
            onClick={() => setActiveSubTab('assistant')}
            style={{
              padding: '4px 12px',
              borderRadius: '6px',
              border: 'none',
              background: activeSubTab === 'assistant' ? '#2563eb' : 'transparent',
              color: activeSubTab === 'assistant' ? '#fff' : '#64748b',
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
              background: activeSubTab === 'planner' ? '#2563eb' : 'transparent',
              color: activeSubTab === 'planner' ? '#fff' : '#64748b',
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
