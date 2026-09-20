import React, { useState, useEffect, useRef, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import Timeline from './components/Timeline'
import ChatPanel from './components/ChatPanel'
import AgentPanel from './components/AgentPanel'
import CalendarView from './components/CalendarView'
import NorthstarPanel from './components/NorthstarPanel'
import SpecialistPanel from './components/SpecialistPanel'
import AuthModal from './components/AuthModal'
import {
  checkBackendHealth,
  fetchTasks,
  sendQueryToAssistant,
  fetchUsageSummary,
  fetchCurrentUser,
  getGoogleOAuthConnectUrl,
  disconnectCalendar,
} from './api/client'

export default function App() {
  const [tasks, setTasks] = useState([])
  const [activeTab, setActiveTab] = useState('northstar')
  const [selectedDomain, setSelectedDomain] = useState('all')
  const [backendStatus, setBackendStatus] = useState('Connecting...')
  const [conversationId, setConversationId] = useState(null)
  const [usageStats, setUsageStats] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: "Hey! I'm Compass, your productivity copilot. I can track tasks, recall code context, synthesize cross-domain roadmaps, and search the web. What's on your mind?"
    }
  ])
  const [isTyping, setIsTyping] = useState(false)

  // Keep a ref to the latest tasks state for stable diffing without triggering interval re-creations
  const tasksRef = useRef([])
  tasksRef.current = tasks

  // Refresh usage stats from the backend (public endpoint, no auth required)
  const refreshUsage = useCallback(async () => {
    const stats = await fetchUsageSummary()
    if (stats) setUsageStats(stats)
  }, [])

  // P0.1 FIX: Domain-aware task fetcher — fires a NEW server-side request with
  // ?domain=<X> query param every time selectedDomain changes, instead of
  // client-side array filtering on stale data.
  const loadTasks = useCallback(async (domain) => {
    try {
      const incomingTasks = await fetchTasks(domain)
      if (!Array.isArray(incomingTasks)) return

      const currentTasks = tasksRef.current
      const hasLengthChanged = incomingTasks.length !== currentTasks.length
      const hasContentChanged = incomingTasks.some((task, i) => {
        const cur = currentTasks[i]
        return !cur || cur.id !== task.id || cur.title !== task.title || cur.countdown !== task.countdown
      })
      if (hasLengthChanged || hasContentChanged) {
        setTasks(incomingTasks)
      }
    } catch {
      // Silently preserve current view during transient connection blips
    }
  }, [])

  // Re-fetch tasks from server whenever the domain filter changes
  useEffect(() => {
    loadTasks(selectedDomain)
  }, [selectedDomain, loadTasks])

  // Check URL query parameters on mount to prompt account selection or show OAuth errors
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('oauth_error') || params.get('select_account')) {
      setShowAuthModal(true)
    }
  }, [])

  const handleUserChanged = useCallback(async (newEmail) => {
    if (newEmail) {
      const u = await fetchCurrentUser()
      setCurrentUser(u)
    } else {
      setCurrentUser({ authenticated: false, email: '' })
    }
    loadTasks(selectedDomain)
    refreshUsage()
  }, [loadTasks, selectedDomain, refreshUsage])

  useEffect(() => {
    let isMounted = true

    // Health Polling (Every 10 seconds)
    const pollHealth = async () => {
      try {
        const status = await checkBackendHealth()
        if (isMounted) setBackendStatus(status)
      } catch {
        if (isMounted) setBackendStatus('Demo Mode • Mock Memory')
      }
    }

    // Task Polling (Every 3000ms with Clean State Merge) — uses current domain filter
    const pollTasks = () => {
      if (isMounted) loadTasks(selectedDomain)
    }

    // Immediate initial sync
    pollHealth()
    refreshUsage()

    // 1. Task polling interval: 3000ms
    const taskInterval = setInterval(pollTasks, 3000)

    // 2. Health check polling interval: 10,000ms (10 seconds)
    const healthInterval = setInterval(pollHealth, 10000)

    // Component Cleanup: clear all interval timers on unmount
    return () => {
      isMounted = false
      clearInterval(taskInterval)
      clearInterval(healthInterval)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const domainCounts = {
    hackathon: tasks.filter(t => t.domain === 'hackathon').length,
    coursework: tasks.filter(t => t.domain === 'coursework').length,
    code: tasks.filter(t => t.domain === 'code').length,
    general: tasks.filter(t => t.domain === 'general').length,
  }

  const handleSendMessage = async (userText) => {
    setIsTyping(true)

    const result = await sendQueryToAssistant(userText, conversationId)

    setIsTyping(false)

    // Update conversation_id for multi-turn threading
    if (result.conversation_id && result.conversation_id !== conversationId) {
      setConversationId(result.conversation_id)
    }

    // P0.2 FIX: Refresh usage counter after every chat turn so the header
    // reflects real token consumption instead of showing a static string.
    refreshUsage()

    return result.response
  }

  // P0.2: Build the live header badge text with micro-dollar precision
  const usageBadge = usageStats
    ? `⚡ ${usageStats.total_requests ?? 0} calls · $${(usageStats.total_estimated_cost_usd ?? 0).toFixed(5)}`
    : 'Nebius • Nemotron-3'

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', background: 'var(--bg-app)', overflow: 'hidden' }}>
      <Sidebar
        activeDomain={selectedDomain}
        onSelectDomain={setSelectedDomain}
        domainCounts={domainCounts}
        backendStatus={backendStatus}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        usageBadge={usageBadge}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-app)', minWidth: 0, overflow: 'hidden' }}>
        <header style={{
          height: '56px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          flexShrink: 0,
          background: 'var(--bg-card, var(--bg-app))'
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              id="tab-northstar"
              onClick={() => setActiveTab('northstar')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'northstar' ? 'var(--bg-sidebar-active, rgba(255,255,255,0.08))' : 'transparent',
                color: activeTab === 'northstar' ? 'var(--text-main, #fff)' : 'var(--text-muted, #64748b)',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '13px'
              }}>
              🧭 Northstar AI
            </button>
            <button
              id="tab-specialist"
              onClick={() => setActiveTab('specialist')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'specialist' ? 'var(--bg-sidebar-active, rgba(255,255,255,0.08))' : 'transparent',
                color: activeTab === 'specialist' ? 'var(--text-main, #fff)' : 'var(--text-muted, #64748b)',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '13px'
              }}>
              🧠 Specialist Team
            </button>
            <button
              id="tab-timeline"
              onClick={() => setActiveTab('timeline')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'timeline' ? 'var(--bg-sidebar-active, rgba(255,255,255,0.08))' : 'transparent',
                color: activeTab === 'timeline' ? 'var(--text-main, #fff)' : 'var(--text-muted, #64748b)',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '13px'
              }}>
              📅 Timeline Feed
            </button>
            <button
              id="tab-chat"
              onClick={() => setActiveTab('chat')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'chat' ? 'var(--bg-sidebar-active, rgba(255,255,255,0.08))' : 'transparent',
                color: activeTab === 'chat' ? 'var(--text-main, #fff)' : 'var(--text-muted, #64748b)',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '13px'
              }}>
              💬 Assistant Chat
            </button>
            <button
              id="tab-agent"
              onClick={() => setActiveTab('agent')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'agent' ? 'var(--bg-sidebar-active, rgba(255,255,255,0.08))' : 'transparent',
                color: activeTab === 'agent' ? 'var(--text-main, #fff)' : 'var(--text-muted, #64748b)',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '13px'
              }}>
              🧭 Agent Planner
            </button>
            <button
              id="tab-calendar"
              onClick={() => setActiveTab('calendar')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: activeTab === 'calendar' ? 'var(--bg-sidebar-active, rgba(255,255,255,0.08))' : 'transparent',
                color: activeTab === 'calendar' ? 'var(--text-main, #fff)' : 'var(--text-muted, #64748b)',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '13px'
              }}>
              🗓️ Schedule & Calendar
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {/* P0.2: Live usage counter — updates after every chat message */}
            <div id="usage-badge" className="header-model-badge" style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)', fontFamily: 'JetBrains Mono, monospace' }}>
              {usageBadge}
            </div>

            {/* Account Selector Pill / Google Login */}
            {currentUser && currentUser.authenticated ? (
              <div
                id="user-profile-badge"
                onClick={() => setShowAuthModal(true)}
                title="Click to switch account or manage Google Calendar"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'var(--bg-input, rgba(30, 41, 59, 0.8))',
                  border: '1px solid var(--border)',
                  padding: '5px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  color: 'var(--text-main)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}>
                <span style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: '#10b981',
                  boxShadow: '0 0 6px #10b981',
                }} />
                <span style={{ fontWeight: '600', color: 'var(--text-main)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {currentUser.email}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>▾</span>
                <button
                  onClick={async (e) => {
                    e.stopPropagation()
                    await disconnectCalendar()
                    setCurrentUser({ authenticated: false, email: '' })
                    loadTasks(selectedDomain)
                  }}
                  title="Sign out / Disconnect"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    padding: '0 2px',
                    marginLeft: '4px'
                  }}>
                  ✕
                </button>
              </div>
            ) : (
              <button
                id="header-btn-login-account"
                onClick={() => setShowAuthModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  background: 'rgba(59, 130, 246, 0.12)',
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  color: '#60a5fa',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}>
                👤 Sign in / Choose Account
              </button>
            )}
          </div>
        </header>

        {activeTab === 'specialist' ? (
          <SpecialistPanel
            onTaskMutated={() => {
              loadTasks(selectedDomain)
              refreshUsage()
            }}
          />
        ) : activeTab === 'timeline' ? (
          <Timeline
            tasks={tasks}
            activeDomain={selectedDomain}
            onSelectDomain={setSelectedDomain}
            onTasksUpdated={() => {
              loadTasks(selectedDomain)
              refreshUsage()
            }}
          />
        ) : activeTab === 'calendar' ? (
          <CalendarView
            tasks={tasks}
            activeDomain={selectedDomain}
            onTasksUpdated={() => {
              loadTasks(selectedDomain)
              refreshUsage()
            }}
            onOpenAuthModal={() => setShowAuthModal(true)}
          />
        ) : activeTab === 'agent' ? (
          <AgentPanel
            onTaskMutated={() => {
              loadTasks(selectedDomain)
              refreshUsage()
            }}
            conversationId={conversationId}
          />
        ) : activeTab === 'chat' ? (
          <ChatPanel
            messages={messages}
            setMessages={setMessages}
            conversationId={conversationId}
            setConversationId={setConversationId}
            onSendMessage={handleSendMessage}
            isTyping={isTyping}
            onChatComplete={refreshUsage}
            tasks={tasks}
            backendStatus={backendStatus}
          />
        ) : (
          <NorthstarPanel
            messages={messages}
            setMessages={setMessages}
            conversationId={conversationId}
            setConversationId={setConversationId}
            onSendMessage={handleSendMessage}
            isTyping={isTyping}
            onChatComplete={refreshUsage}
            onTaskMutated={() => {
              loadTasks(selectedDomain)
              refreshUsage()
            }}
          />
        )}
      </main>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        currentUser={currentUser}
        onUserChanged={handleUserChanged}
      />
    </div>
  )
}