import React, { useState, useMemo, useCallback, useEffect } from 'react'
import DarkModeToggle from './DarkModeToggle'
import { getDomainMeta } from './timeline/domainMeta'
import AddDeadlineModal from './timeline/AddDeadlineModal'
import { updateTask, seedJudgeDemoPersona } from '../api/client'
import Logo from './Logo'
import {
  classifyDeadline,
  filterTasksByView,
  sortOverdueDeadlines,
  sortUpcomingDeadlines,
} from '../utils/deadlineClassifier'


const VIEW_OPTIONS = [
  { key: 'all', label: 'All Tasks', icon: '📋' },
  { key: 'overdue', label: 'Overdue', icon: '⚠️' },
  { key: 'due_today', label: 'Due Today', icon: '📅' },
  { key: 'urgent', label: 'Urgent (<24h)', icon: '🚨' },
  { key: 'due_soon', label: 'Due Soon (7d)', icon: '⏳' },
  { key: 'upcoming', label: 'Upcoming (>7d)', icon: '🗓️' },
  { key: 'pending', label: 'Pending', icon: '📝' },
  { key: 'in_progress', label: 'In Progress', icon: '⚡' },
  { key: 'completed', label: 'Completed', icon: '✅' },
]

export default function Dashboard({

  tasks = [],
  backendStatus = 'Waking up the server…',
  usageStats = null,
  currentUser = null,
  onSelectTab,
  onSelectDomain,
  isDarkMode = false,
  onToggleDarkMode,
  onTasksUpdated,
  onOpenCompass,
  onOpenAuth,
  customDomains = [],
}) {
  const [selectedDomainFilter, setSelectedDomainFilter] = useState('all')
  const [timeFilter, setTimeFilter] = useState('all') // 'all' | 'focus' | 'today' | 'week' | 'overdue' | 'completed'
  const [optimisticOverrides, setOptimisticOverrides] = useState({})
  const [showAddModal, setShowAddModal] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [seedingPersona, setSeedingPersona] = useState(false)
  const [seedSuccess, setSeedSuccess] = useState(false)
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => new Date())

  const handleSeedJudgePersona = useCallback(async () => {
    if (seedingPersona) return
    setSeedingPersona(true)
    try {
      await seedJudgeDemoPersona()
      setSeedSuccess(true)
      setTimeout(() => setSeedSuccess(false), 3000)
      if (onTasksUpdated) await onTasksUpdated()
    } catch (err) {
      alert(`Could not load judge persona: ${err.message}`)
    } finally {
      setSeedingPersona(false)
    }
  }, [seedingPersona, onTasksUpdated])

  const today = useMemo(() => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    })
  }, [])

  const isOnline = useMemo(() => {
    const s = (backendStatus || '').toLowerCase()
    return s.includes('neon') || s.includes('live') || s.includes('connected') || s.includes('ready')
  }, [backendStatus])

  const hasFallbackTasks = useMemo(() => {
    return Array.isArray(tasks) && tasks.some((t) => t && t.is_fallback)
  }, [tasks])

  // Defensive sanitization and optimistic state merging
  const cleanTasks = useMemo(() => {
    if (!Array.isArray(tasks)) return []
    return tasks
      .filter((t) => t && typeof t === 'object' && t.id !== undefined && t.id !== null)
      .map((t) => {
        const override = optimisticOverrides[t.id]
        if (override) {
          return { ...t, status: override }
        }
        return t
      })
  }, [tasks, optimisticOverrides])

  // Apply domain filter
  const domainFilteredTasks = useMemo(() => {
    if (!selectedDomainFilter || selectedDomainFilter === 'all') {
      return cleanTasks
    }
    return cleanTasks.filter((t) => (t.domain || 'general').toLowerCase().trim() === selectedDomainFilter)
  }, [cleanTasks, selectedDomainFilter])

  // Exact view counts matching the 8 contextual categories
  const viewCounts = useMemo(() => {
    const now = new Date()
    const counts = {
      all: domainFilteredTasks.length,
      overdue: 0,
      due_today: 0,
      urgent: 0,
      due_soon: 0,
      upcoming: 0,
      pending: 0,
      in_progress: 0,
      completed: 0,
    }

    domainFilteredTasks.forEach((t) => {
      const c = classifyDeadline(t, now)
      if (c.lifecycle === 'completed') {
        counts.completed++
      } else if (c.lifecycle === 'cancelled') {
        // cancelled tasks excluded from active counts
      } else {
        if (c.timing === 'overdue' && c.isActiveDeadline) counts.overdue++
        if (c.timing === 'due_today' && c.isActiveDeadline) counts.due_today++
        if ((c.timing === 'urgent' || c.timing === 'due_today') && c.isActiveDeadline) counts.urgent++
        if (c.timing === 'due_soon' && c.isActiveDeadline) counts.due_soon++
        if (c.timing === 'upcoming' && c.isActiveDeadline) counts.upcoming++
        if (c.lifecycle === 'pending') counts.pending++
        if (c.lifecycle === 'in_progress') counts.in_progress++
      }
    })

    return counts
  }, [domainFilteredTasks])

  // Apply deterministic view filter
  const displayedTasks = useMemo(() => {
    const now = new Date()
    return filterTasksByView(domainFilteredTasks, timeFilter, now)
  }, [domainFilteredTasks, timeFilter])

  // Metric calculations
  const metrics = useMemo(() => {
    const total = domainFilteredTasks.length
    const completedCount = viewCounts.completed
    const overdueCount = viewCounts.overdue
    let completedTodayCount = 0
    const now = new Date()
    const todayStr = now.toDateString()
    const todayShort = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase()

    domainFilteredTasks.forEach((t) => {
      const s = (t.status || '').toLowerCase()
      const c = (t.countdown || '').toLowerCase()
      const isCompleted = s === 'completed' || s === 'done' || c === 'completed'

      if (isCompleted) {
        if (t.updated_at) {
          const d = new Date(t.updated_at)
          if (!isNaN(d.getTime()) && d.toDateString() === todayStr) {
            completedTodayCount++
          }
        } else if (t.timestamp) {
          const ts = String(t.timestamp).toLowerCase()
          if (
            ts.includes('just now') ||
            ts.includes('min') ||
            ts.includes('hour') ||
            ts.includes('today') ||
            ts.includes(todayShort)
          ) {
            completedTodayCount++
          }
        }
      }
    })

    const completionRate = total > 0 ? Math.round((completedCount / total) * 100) : 0

    return {
      total,
      completedCount,
      completionRate,
      overdueCount,
      completedTodayCount,
    }
  }, [domainFilteredTasks, viewCounts])


  // Tasks by Domain breakdown
  const domainBreakdown = useMemo(() => {
    const baseKeys = ['hackathon', 'coursework', 'code', 'general', 'other']
    const discoveredKeys = new Set(baseKeys)

    cleanTasks.forEach((t) => {
      if (t.domain) {
        discoveredKeys.add(String(t.domain).toLowerCase().trim())
      }
    })

    const counts = {}
    discoveredKeys.forEach((k) => {
      counts[k] = 0
    })

    cleanTasks.forEach((t) => {
      const d = (t.domain || 'general').toLowerCase().trim()
      counts[d] = (counts[d] || 0) + 1
    })

    const list = Array.from(discoveredKeys).map((key) => {
      const meta = getDomainMeta(key)
      const count = counts[key] || 0
      const pct = cleanTasks.length > 0 ? Math.round((count / cleanTasks.length) * 100) : 0
      return {
        key,
        label: meta.label || key,
        icon: meta.icon || '🏷️',
        color: meta.color || 'var(--brand)',
        count,
        pct: Math.min(100, Math.max(0, pct)),
      }
    })

    list.sort((a, b) => b.count - a.count)
    return list
  }, [cleanTasks])

  // "Today's Focus" analysis
  const todayFocus = useMemo(() => {
    const now = new Date()
    const openTasks = domainFilteredTasks.filter((t) => {
      const s = (t.status || '').toLowerCase()
      const c = (t.countdown || '').toLowerCase()
      return s !== 'completed' && s !== 'done' && c !== 'completed'
    })

    const urgentItems = openTasks
      .map((t) => ({ task: t, urgency: classifyDeadline(t, now) }))
      .filter(({ urgency }) => urgency.isOverdue || urgency.type === 'hour' || urgency.type === 'today' || urgency.diffHours <= 24)
      .sort((a, b) => a.urgency.diffHours - b.urgency.diffHours)

    return {
      urgentItems: urgentItems.map((u) => u.task),
      count: urgentItems.length,
      nextItem: urgentItems.length > 0 ? urgentItems[0].task : null,
      nextUrgency: urgentItems.length > 0 ? urgentItems[0].urgency : null,
    }
  }, [domainFilteredTasks])

  // Overdue Deadlines (Unfinished tasks whose deadline has passed, sorted by priority & elapsed days)
  const overdueDeadlines = useMemo(() => {
    return sortOverdueDeadlines(domainFilteredTasks)
  }, [domainFilteredTasks])

  // Upcoming Deadlines (Active tasks with deadline today or future, nearest first)
  const upcomingDeadlines = useMemo(() => {
    return sortUpcomingDeadlines(domainFilteredTasks).slice(0, 6)
  }, [domainFilteredTasks])


  // Recent Activity Feed
  const recentActivity = useMemo(() => {
    return displayedTasks.slice(0, 5)
  }, [displayedTasks])

  // Task Completion Checkbox Handler
  const handleToggleTaskStatus = useCallback(
    async (taskId, currentlyCompleted) => {
      const newStatus = currentlyCompleted ? 'open' : 'completed'
      // Optimistic update
      setOptimisticOverrides((prev) => ({ ...prev, [taskId]: newStatus }))

      try {
        await updateTask(taskId, { status: newStatus })
        if (onTasksUpdated) {
          onTasksUpdated()
        }
      } catch (err) {
        console.warn('Failed to update task status from dashboard:', err)
        // Rollback on error
        setOptimisticOverrides((prev) => {
          const next = { ...prev }
          delete next[taskId]
          return next
        })
      }
    },
    [onTasksUpdated]
  )

  // Manual Refresh Handler
  const handleManualRefresh = useCallback(() => {
    setIsRefreshing(true)
    if (onTasksUpdated) {
      onTasksUpdated()
    }
    setLastRefreshedAt(new Date())
    setTimeout(() => setIsRefreshing(false), 600)
  }, [onTasksUpdated])

  // Last updated human text
  const [timeSinceUpdate, setTimeSinceUpdate] = useState('just now')
  useEffect(() => {
    const timer = setInterval(() => {
      const sec = Math.floor((Date.now() - lastRefreshedAt.getTime()) / 1000)
      if (sec < 60) {
        setTimeSinceUpdate('just now')
      } else if (sec < 3600) {
        setTimeSinceUpdate(`${Math.floor(sec / 60)}m ago`)
      } else {
        setTimeSinceUpdate(`${Math.floor(sec / 3600)}h ago`)
      }
    }, 15000)
    return () => clearInterval(timer)
  }, [lastRefreshedAt])

  return (
    <div className="dashboard-container" style={{ background: 'var(--bg-app)' }} role="main" aria-label="Compass Dashboard">
      {/* Offline / Demo Warning Banner */}
      {hasFallbackTasks && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            background: 'var(--bg-card-soft)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            marginBottom: '18px',
            fontSize: '13px',
            color: 'var(--text-primary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>
              <strong>Demo / Offline Mode:</strong> Backend server is connecting. Displaying cached demo tasks. Your changes will sync once connected.
            </span>
          </div>
          <button
            type="button"
            onClick={handleManualRefresh}
            className="btn-secondary"
            style={{
              minHeight: '36px',
              padding: '0 12px',
              fontSize: '12px',
              fontWeight: '600',
            }}
          >
            Retry Sync
          </button>
        </div>
      )}

      {/* Page Header */}
      <div style={{ marginBottom: '22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2
                style={{
                  fontSize: '26px',
                  fontWeight: '600',
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.3px',
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                  lineHeight: 1.2,
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="7" height="9" x="3" y="3" rx="1" />
                  <rect width="7" height="5" x="14" y="3" rx="1" />
                  <rect width="7" height="9" x="14" y="12" rx="1" />
                  <rect width="7" height="5" x="3" y="16" rx="1" />
                </svg>
                <span>Dashboard</span>
                <span style={{ color: 'var(--text-muted)', fontWeight: '400', fontSize: '15px' }}>
                  , {today}
                </span>
              </h2>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: 0 }}>
              Live workspace telemetry, task distribution, upcoming deadlines, and system telemetry
            </p>
          </div>

          {/* Header Action Buttons & Dark Mode Toggle: 1 primary amber, rest secondary */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              id="dashboard-btn-new-task"
              onClick={() => setShowAddModal(true)}
              className="btn-primary-amber"
              aria-label="Add new task or deadline"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14" />
                <path d="M12 5v14" />
              </svg>
              <span>New Deadline</span>
            </button>

            {onSelectTab && (
              <>
                <button
                  type="button"
                  id="dashboard-btn-open-schedule"
                  onClick={() => onSelectTab('calendar')}
                  className="btn-secondary"
                  title="Open Schedule & Google Calendar sync"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect width="18" height="18" x="3" y="4" rx="2" />
                    <path d="M3 10h18" />
                    <path d="M8 2v4" />
                    <path d="M16 2v4" />
                  </svg>
                  <span>Schedule</span>
                </button>

                <button
                  type="button"
                  id="dashboard-btn-open-compass"
                  onClick={() => onSelectTab('compass')}
                  className="btn-secondary"
                  title="Open Compass AI Assistant & Planner"
                >
                  <Logo size={15} alt="" />
                  <span>Compass</span>
                </button>

                <button
                  type="button"
                  id="dashboard-btn-load-judge-persona"
                  onClick={handleSeedJudgePersona}
                  disabled={seedingPersona}
                  className="btn-secondary"
                  title="Explicit 1-Click Demo: Populates sample multi-domain tasks and vector memory for hackathon judges"
                  style={{
                    cursor: seedingPersona ? 'wait' : 'pointer',
                  }}
                >
                  {seedSuccess ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--domain-code, #1c8a62)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <circle cx="12" cy="12" r="6" />
                      <circle cx="12" cy="12" r="2" />
                    </svg>
                  )}
                  <span>{seedingPersona ? 'Loading…' : seedSuccess ? 'Persona Loaded!' : 'Load Judge Persona'}</span>
                </button>
              </>
            )}

            <button
              type="button"
              id="dashboard-btn-refresh"
              onClick={handleManualRefresh}
              className="btn-secondary"
              aria-label="Refresh dashboard data"
              title={`Last synced: ${timeSinceUpdate}`}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{
                  animation: isRefreshing ? 'spin 0.6s linear infinite' : 'none',
                }}
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 21h5v-5" />
              </svg>
              <span style={{ fontSize: '12px' }}>{timeSinceUpdate}</span>
            </button>

            <div style={{ flexShrink: 0 }}>
              <DarkModeToggle
                isDarkMode={Boolean(isDarkMode)}
                onToggleDarkMode={onToggleDarkMode}
                id="dashboard-theme-toggle"
              />
            </div>
          </div>
        </div>
      </div>

      {/* SECTION: Today's Focus Card */}
      <div className="dashboard-focus-card" role="region" aria-label="Today's focus area" style={{ borderRadius: '8px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '6px',
              background: 'var(--bg-card-soft)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="2" />
            </svg>
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' }}>
                {todayFocus.count > 0
                  ? `${todayFocus.count} ${todayFocus.count === 1 ? 'task needs' : 'tasks need'} attention today`
                  : "You're all caught up for today!"}
              </span>
              {todayFocus.nextUrgency && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: '600',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: todayFocus.nextUrgency.isOverdue
                      ? 'var(--danger-bg)'
                      : 'var(--bg-card-soft)',
                    color: todayFocus.nextUrgency.isOverdue ? 'var(--danger-text)' : 'var(--text-primary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {todayFocus.nextUrgency.label}
                </span>
              )}
            </div>

            <div
              style={{
                fontSize: '13px',
                color: 'var(--text-muted)',
                marginTop: '2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={todayFocus.nextItem ? todayFocus.nextItem.title : ''}
            >
              {todayFocus.nextItem ? (
                <>
                  Next up: <strong style={{ color: 'var(--text-primary)' }}>{todayFocus.nextItem.title}</strong>{' '}
                  <span style={{ color: 'var(--text-muted)' }}>({todayFocus.nextItem.project || todayFocus.nextItem.domain})</span>
                </>
              ) : (
                'Enjoy your focused time or plan your upcoming schedule with Compass.'
              )}
            </div>
          </div>
        </div>

        {/* Focus Actions: min 44px tap target */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {todayFocus.nextItem && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleToggleTaskStatus(todayFocus.nextItem.id, false)}
              title="Mark this focus task as completed"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Complete</span>
            </button>
          )}

          {onOpenCompass && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                const prompt =
                  todayFocus.count > 0
                    ? `I have ${todayFocus.count} tasks needing attention today. Please analyze my deadlines and suggest an optimal step-by-step roadmap for today.`
                    : 'Please review my upcoming tasks and projects and propose a focus schedule for this week.'
                onOpenCompass(prompt)
              }}
            >
              <Logo size={14} alt="" />
              <span>Ask Compass to Plan</span>
            </button>
          )}
        </div>
      </div>


      {/* DOMAIN FILTER BAR */}
      <div className="dashboard-filter-bar" role="tablist" aria-label="Filter dashboard by context domain">
        <button
          type="button"
          onClick={() => setSelectedDomainFilter('all')}
          className={`filter-pill ${selectedDomainFilter === 'all' ? 'active' : ''}`}
          role="tab"
          aria-selected={selectedDomainFilter === 'all'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect width="7" height="7" x="3" y="3" rx="1" />
            <rect width="7" height="7" x="14" y="3" rx="1" />
            <rect width="7" height="7" x="14" y="14" rx="1" />
            <rect width="7" height="7" x="3" y="14" rx="1" />
          </svg>
          <span>All Domains ({cleanTasks.length})</span>
        </button>

        {domainBreakdown.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setSelectedDomainFilter(item.key)}
            className={`filter-pill ${selectedDomainFilter === item.key ? 'active' : ''}`}
            role="tab"
            aria-selected={selectedDomainFilter === item.key}
          >
            <span className="domain-swatch" style={{ background: item.color }} />
            <span>
              {item.label} ({item.count})
            </span>
          </button>
        ))}

        {selectedDomainFilter !== 'all' && (
          <button
            type="button"
            onClick={() => setSelectedDomainFilter('all')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer',
              padding: '0 8px',
              minHeight: '44px',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            Reset filter ✕
          </button>
        )}
      </div>

      {/* SECTION 1: Quick Stat Cards (Interactive Filtering) */}
      <div className="dashboard-stat-grid" role="region" aria-label="Quick statistics">
        {/* Total Tasks */}
        <div
          className={`dashboard-stat-card ${timeFilter === 'all' ? 'active-filter' : ''}`}
          onClick={() => setTimeFilter('all')}
          tabIndex={0}
          role="button"
          aria-pressed={timeFilter === 'all'}
          aria-label={`Total tasks: ${metrics.total}. Click to show all tasks.`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setTimeFilter('all')
            }
          }}
          title="Click to view all tasks"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Tasks
            </span>
            <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <path d="M12 11h4" />
                <path d="M12 16h4" />
                <path d="M8 11h.01" />
                <path d="M8 16h.01" />
              </svg>
            </span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '600', color: 'var(--text-primary)', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
            {metrics.total}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {selectedDomainFilter === 'all' ? 'Across all domains' : `In ${selectedDomainFilter}`}
          </div>
        </div>

        {/* Completion Rate */}
        <div
          className={`dashboard-stat-card ${timeFilter === 'completed' ? 'active-filter' : ''}`}
          onClick={() => setTimeFilter((prev) => (prev === 'completed' ? 'all' : 'completed'))}
          tabIndex={0}
          role="button"
          aria-pressed={timeFilter === 'completed'}
          aria-label={`Completion rate: ${metrics.completionRate} percent. Click to filter completed tasks.`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setTimeFilter((prev) => (prev === 'completed' ? 'all' : 'completed'))
            }
          }}
          title="Click to filter completed tasks"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Completion Rate
            </span>
            <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                <polyline points="16 7 22 7 22 13" />
              </svg>
            </span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '600', color: 'var(--text-primary)', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
            {metrics.completionRate}%
          </div>
          <div style={{ width: '100%', height: '4px', background: 'var(--border)', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${metrics.completionRate}%`,
                height: '100%',
                background: 'var(--domain-code)',
                borderRadius: '2px',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
            {metrics.completedCount} of {metrics.total} tasks completed
          </div>
        </div>

        {/* Overdue Tasks */}
        <div
          className={`dashboard-stat-card ${timeFilter === 'overdue' ? 'active-filter' : ''}`}
          onClick={() => setTimeFilter((prev) => (prev === 'overdue' ? 'all' : 'overdue'))}
          tabIndex={0}
          role="button"
          aria-pressed={timeFilter === 'overdue'}
          aria-label={`Overdue tasks: ${metrics.overdueCount}. Click to filter overdue tasks.`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setTimeFilter((prev) => (prev === 'overdue' ? 'all' : 'overdue'))
            }
          }}
          title="Click to filter overdue tasks"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Overdue
            </span>
            <span style={{ color: metrics.overdueCount > 0 ? 'var(--danger-text)' : 'var(--text-muted)', display: 'inline-flex' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
          </div>
          <div
            style={{
              fontSize: '26px',
              fontWeight: '600',
              color: metrics.overdueCount > 0 ? 'var(--danger-text)' : 'var(--text-primary)',
              letterSpacing: '-0.3px',
              lineHeight: 1.2,
            }}
          >
            {metrics.overdueCount}
          </div>
          <div style={{ fontSize: '12px', color: metrics.overdueCount > 0 ? 'var(--danger-text)' : 'var(--text-muted)', marginTop: '4px' }}>
            {metrics.overdueCount > 0 ? 'Requires attention' : 'No overdue items'}
          </div>
        </div>

        {/* Completed Today */}
        <div
          className={`dashboard-stat-card ${timeFilter === 'today' ? 'active-filter' : ''}`}
          onClick={() => setTimeFilter((prev) => (prev === 'today' ? 'all' : 'today'))}
          tabIndex={0}
          role="button"
          aria-pressed={timeFilter === 'today'}
          aria-label={`Completed today: ${metrics.completedTodayCount}. Click to filter today's tasks.`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setTimeFilter((prev) => (prev === 'today' ? 'all' : 'today'))
            }
          }}
          title="Click to filter today's tasks"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Completed Today
            </span>
            <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '600', color: 'var(--text-primary)', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
            {metrics.completedTodayCount}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Checked off today
          </div>
        </div>
      </div>

      {/* SECTION 1.5: Deadline & Lifecycle Category Views */}
      <div
        className="dashboard-filter-bar"
        role="tablist"
        aria-label="Filter tasks by lifecycle and deadline status"
        style={{ marginTop: '14px', marginBottom: '14px', overflowX: 'auto', flexWrap: 'wrap' }}
      >
        {VIEW_OPTIONS.map((opt) => {
          const isActive = timeFilter === opt.key
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setTimeFilter(opt.key)}
              className={`filter-pill ${isActive ? 'active' : ''}`}
              role="tab"
              aria-selected={isActive}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: isActive ? '600' : '500',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{opt.icon}</span>
              <span>
                {opt.label} ({viewCounts[opt.key] ?? 0})
              </span>
            </button>
          )
        })}
      </div>

      {/* FILTERED TASKS EXPANDED CARD (Shown when a specific view category is selected) */}
      {timeFilter !== 'all' && (
        <div
          className="dashboard-section-card"
          role="region"
          aria-label={`Filtered view: ${timeFilter}`}
          style={{ marginBottom: '20px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{VIEW_OPTIONS.find((v) => v.key === timeFilter)?.icon || '📌'}</span>
              <span>
                {VIEW_OPTIONS.find((v) => v.key === timeFilter)?.label || timeFilter} ({displayedTasks.length})
              </span>
            </h3>
            <button
              type="button"
              onClick={() => setTimeFilter('all')}
              className="btn-secondary"
              style={{ minHeight: '32px', padding: '0 10px', fontSize: '12px' }}
            >
              Show all tasks ✕
            </button>
          </div>

          {displayedTasks.length === 0 ? (
            <div className="dashboard-empty-state">
              <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                No tasks in this category
              </p>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                {timeFilter === 'overdue' && 'All clear! You have no overdue deadlines.'}
                {timeFilter === 'due_today' && 'No tasks due today. Everything is on schedule.'}
                {timeFilter === 'urgent' && 'No urgent tasks due in the next 24 hours.'}
                {timeFilter === 'due_soon' && 'No tasks due within the next 7 days.'}
                {timeFilter === 'upcoming' && 'No distant future deadlines scheduled.'}
                {timeFilter === 'pending' && 'No pending tasks without deadlines.'}
                {timeFilter === 'in_progress' && 'No tasks currently marked as in progress.'}
                {timeFilter === 'completed' && 'No completed tasks yet. Finish a task to see it here.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {displayedTasks.map((task) => {
                const meta = getDomainMeta(task.domain)
                const c = classifyDeadline(task)
                const isCompleted = c.lifecycle === 'completed'

                return (
                  <div
                    key={task.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      opacity: isCompleted ? 0.85 : 1,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleTaskStatus(task.id, isCompleted)}
                      className="btn-touch-target"
                      style={{
                        width: '32px',
                        height: '32px',
                        minWidth: '32px',
                        minHeight: '32px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: isCompleted ? 'var(--domain-code)' : 'var(--bg-card-soft)',
                        color: isCompleted ? '#ffffff' : 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        padding: 0,
                        flexShrink: 0,
                      }}
                      title={isCompleted ? 'Mark as open' : 'Mark as completed'}
                      aria-label={`Toggle task completion for ${task.title}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
                        <span className="domain-swatch" style={{ background: meta.color }} />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>
                          {task.project || meta.label}
                        </span>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: '600',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: 'var(--bg-card-soft)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border)',
                            textTransform: 'uppercase',
                          }}
                        >
                          {c.priority}
                        </span>
                        {c.lifecycle !== 'pending' && (
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: '600',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: 'var(--bg-card-soft)',
                              color: 'var(--text-muted)',
                              border: '1px solid var(--border)',
                            }}
                          >
                            {c.lifecycle}
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: '13.5px',
                          fontWeight: '500',
                          color: isCompleted ? 'var(--text-muted)' : 'var(--text-primary)',
                          textDecoration: isCompleted ? 'line-through' : 'none',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {task.title}
                      </div>
                    </div>

                    <div style={{ flexShrink: 0 }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: '600',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: c.isOverdue
                            ? 'var(--danger-bg)'
                            : c.isUrgent
                            ? 'rgba(230, 81, 0, 0.12)'
                            : 'var(--bg-card-soft)',
                          color: c.isOverdue
                            ? 'var(--danger-text)'
                            : c.isUrgent
                            ? '#e65100'
                            : 'var(--text-secondary)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {c.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}


      {/* SECTION 2 & 3: Main Two-Column Row */}
      <div className="dashboard-main-grid">
        {/* Tasks by Domain */}
        <div className="dashboard-section-card" role="region" aria-label="Tasks distributed by domain">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
                <circle cx="7" cy="7" r=".5" fill="currentColor" />
              </svg>
              <span>Tasks by Domain</span>
            </h3>
            {onSelectTab && (
              <button
                type="button"
                onClick={() => {
                  if (onSelectDomain && selectedDomainFilter !== 'all') {
                    onSelectDomain(selectedDomainFilter)
                  }
                  onSelectTab('timeline')
                }}
                className="btn-secondary"
                style={{
                  minHeight: '36px',
                  padding: '0 10px',
                  fontSize: '12px',
                }}
              >
                Timeline view →
              </button>
            )}
          </div>

          {cleanTasks.length === 0 ? (
            <div className="dashboard-empty-state">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginBottom: '8px', color: 'var(--text-muted)' }}>
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                No tasks tracked yet
              </p>
              <p style={{ margin: '4px 0 14px 0', fontSize: '13px', color: 'var(--text-muted)', maxWidth: '300px' }}>
                Create your first deadline or ask Compass Assistant to synthesize your workload.
              </p>
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="btn-primary-amber"
              >
                + Create First Task
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {domainBreakdown.map((item) => (
                <div
                  key={item.key}
                  tabIndex={0}
                  role="button"
                  aria-label={`${item.label}: ${item.count} tasks, ${item.pct} percent. Click to filter.`}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '6px',
                    background: selectedDomainFilter === item.key ? 'var(--bg-card-soft)' : 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => {
                    setSelectedDomainFilter((prev) => (prev === item.key ? 'all' : item.key))
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedDomainFilter((prev) => (prev === item.key ? 'all' : item.key))
                    }
                  }}
                  title={`Filter by ${item.label}`}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="domain-swatch" style={{ background: item.color }} />
                      <span style={{ fontSize: '13.5px', fontWeight: '500', color: 'var(--text-primary)' }}>
                        {item.label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)' }}>
                        {item.count} {item.count === 1 ? 'task' : 'tasks'}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '34px', textAlign: 'right' }}>
                        {item.pct}%
                      </span>
                    </div>
                  </div>
                  <div style={{ width: '100%', height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${item.pct}%`,
                        height: '100%',
                        background: item.color,
                        borderRadius: '2px',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Overdue Deadlines — Action Required */}
        {overdueDeadlines.length > 0 && (
          <div className="dashboard-section-card" role="region" aria-label="Overdue deadlines list" style={{ borderLeft: '3px solid #e65100' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#e65100', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>Overdue Deadlines ({overdueDeadlines.length})</span>
              </h3>
              <button
                type="button"
                onClick={() => setTimeFilter('overdue')}
                className="btn-secondary"
                style={{
                  minHeight: '32px',
                  padding: '0 10px',
                  fontSize: '12px',
                  color: '#e65100',
                  borderColor: 'rgba(230, 81, 0, 0.4)',
                }}
              >
                View all ({overdueDeadlines.length}) →
              </button>

            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {overdueDeadlines.slice(0, 5).map((task) => {
                const meta = getDomainMeta(task.domain)
                return (
                  <div
                    key={task.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      background: 'rgba(230, 81, 0, 0.04)',
                      border: '1px solid rgba(230, 81, 0, 0.25)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleTaskStatus(task.id, false)}
                      className="btn-touch-target"
                      style={{
                        width: '32px',
                        height: '32px',
                        minWidth: '32px',
                        minHeight: '32px',
                        borderRadius: '6px',
                        border: '1px solid rgba(230, 81, 0, 0.4)',
                        background: 'var(--bg-card-soft)',
                        color: 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        padding: 0,
                        flexShrink: 0,
                      }}
                      title="Mark as completed"
                      aria-label={`Mark task ${task.title} as completed`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>

                    <div
                      style={{ minWidth: 0, flex: 1, cursor: onSelectTab ? 'pointer' : 'default' }}
                      onClick={() => onSelectTab && onSelectTab('timeline')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <span className="domain-swatch" style={{ background: meta.color }} />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>
                          {task.project || meta.label}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '13.5px',
                          fontWeight: '500',
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {task.title}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: '600',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          background: 'rgba(230, 81, 0, 0.15)',
                          color: '#e65100',
                          border: '1px solid rgba(230, 81, 0, 0.35)',
                        }}
                      >
                        {task.urgency?.label || 'Overdue'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Upcoming Deadlines */}
        <div className="dashboard-section-card" role="region" aria-label="Upcoming deadlines list">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>Upcoming Deadlines</span>
            </h3>
            <button
              type="button"
              onClick={() => setTimeFilter('upcoming')}
              className="btn-secondary"
              style={{
                minHeight: '36px',
                padding: '0 10px',
                fontSize: '12px',
              }}
            >
              View all ({viewCounts.upcoming}) →
            </button>

          </div>

          {upcomingDeadlines.length === 0 ? (
            <div className="dashboard-empty-state">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginBottom: '8px', color: 'var(--text-muted)' }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                No pending deadlines
              </p>
              <p style={{ margin: '4px 0 14px 0', fontSize: '13px', color: 'var(--text-muted)', maxWidth: '300px' }}>
                You have cleared all scheduled deadlines! Take a breather or log a new milestone.
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="btn-primary-amber"
                >
                  + Add Deadline
                </button>
                <button
                  type="button"
                  id="dashboard-empty-seed-persona"
                  onClick={handleSeedJudgePersona}
                  disabled={seedingPersona}
                  className="btn-secondary"
                  title="Populates sample multi-domain tasks and hackathon deadlines for judges"
                  style={{
                    cursor: seedingPersona ? 'wait' : 'pointer',
                  }}
                >
                  {seedSuccess ? 'Persona Loaded!' : seedingPersona ? 'Loading…' : 'Load Judge Persona'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {upcomingDeadlines.map((task) => {
                const meta = getDomainMeta(task.domain)
                const isOverdue = task.urgency?.isOverdue
                const isUrgent = task.urgency?.isUrgent

                return (
                  <div
                    key={task.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {/* Inline Completion Checkbox: 6px radius, 44px min tap */}
                    <button
                      type="button"
                      onClick={() => handleToggleTaskStatus(task.id, false)}
                      className="btn-touch-target"
                      style={{
                        width: '32px',
                        height: '32px',
                        minWidth: '32px',
                        minHeight: '32px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-card-soft)',
                        color: 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        padding: 0,
                        flexShrink: 0,
                        transition: 'all 0.15s ease',
                      }}
                      title="Mark as completed"
                      aria-label={`Mark task ${task.title} as completed`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>

                    <div
                      style={{ minWidth: 0, flex: 1, cursor: onSelectTab ? 'pointer' : 'default' }}
                      onClick={() => {
                        if (onSelectTab) onSelectTab('timeline')
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <span className="domain-swatch" style={{ background: meta.color }} />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>
                          {task.project || meta.label}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '13.5px',
                          fontWeight: '500',
                          color: 'var(--text-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={task.title}
                      >
                        {task.title || 'Untitled Task'}
                      </div>
                    </div>

                    <div style={{ flexShrink: 0 }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: isOverdue
                            ? 'var(--danger-bg)'
                            : 'var(--bg-card-soft)',
                          color: isOverdue
                            ? 'var(--danger-text)'
                            : isUrgent
                            ? 'var(--accent-text)'
                            : 'var(--text-secondary)',
                          border: '1px solid var(--border)',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11.5px',
                          fontWeight: '500',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {task.urgency?.label || task.countdown || 'Active'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* SECTION 4 & 5: Recent Activity & System Status */}
      <div className="dashboard-main-grid">
        {/* Recent Activity */}
        <div className="dashboard-section-card" role="region" aria-label="Recent activity feed">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              <span>Recent Activity</span>
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '500' }}>
              Latest milestones
            </span>
          </div>

          {recentActivity.length === 0 ? (
            <div className="dashboard-empty-state">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginBottom: '8px', color: 'var(--text-muted)' }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                No activity to display
              </p>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                Completed and created tasks will appear here.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recentActivity.map((task) => {
                const meta = getDomainMeta(task.domain)
                const isCompleted =
                  (task.status || '').toLowerCase() === 'completed' ||
                  (task.status || '').toLowerCase() === 'done' ||
                  (task.countdown || '').toLowerCase() === 'completed'

                return (
                  <div
                    key={task.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      opacity: isCompleted ? 0.85 : 1,
                    }}
                  >
                    {/* Toggle button */}
                    <button
                      type="button"
                      onClick={() => handleToggleTaskStatus(task.id, isCompleted)}
                      className="btn-touch-target"
                      style={{
                        width: '32px',
                        height: '32px',
                        minWidth: '32px',
                        minHeight: '32px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: isCompleted ? 'var(--domain-code)' : 'var(--bg-card-soft)',
                        color: isCompleted ? '#ffffff' : 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        padding: 0,
                        flexShrink: 0,
                        transition: 'all 0.15s ease',
                      }}
                      title={isCompleted ? 'Mark as open' : 'Mark as completed'}
                      aria-label={`Toggle task completion for ${task.title}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontWeight: '500',
                            background: 'var(--bg-card-soft)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <span className="domain-swatch" style={{ background: meta.color }} />
                          <span>{meta.label}</span>
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {task.timestamp || 'Recently'}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '13.5px',
                          fontWeight: '500',
                          color: isCompleted ? 'var(--text-muted)' : 'var(--text-primary)',
                          textDecoration: isCompleted ? 'line-through' : 'none',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={task.title}
                      >
                        {task.title || 'Untitled task'}
                      </div>
                    </div>

                    <div style={{ flexShrink: 0 }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: '500',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: 'var(--bg-card-soft)',
                          color: isCompleted ? 'var(--domain-code)' : 'var(--text-secondary)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {isCompleted ? '✓ Done' : 'Open'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* System & Telemetry Status */}
        <div className="dashboard-section-card" role="region" aria-label="System connectivity and model telemetry">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
                <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
                <line x1="6" y1="6" x2="6.01" y2="6" />
                <line x1="6" y1="18" x2="6.01" y2="18" />
              </svg>
              <span>System & Telemetry</span>
            </h3>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11.5px',
                fontWeight: '500',
                padding: '3px 8px',
                borderRadius: '6px',
                background: 'var(--bg-card-soft)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: isOnline ? '#1c8a62' : '#f5a623',
                }}
              />
              {isOnline ? 'System Online' : 'Connecting'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Backend Database Status */}
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>
                  Backend Database
                </div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginTop: '2px' }}>
                  {backendStatus || 'Online'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                  PostgreSQL 16 · pgvector HNSW
                </div>
              </div>
              <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                </svg>
              </span>
            </div>

            {/* Workspace & Google Calendar Connection */}
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>
                  Workspace & Calendar
                </div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginTop: '2px' }}>
                  {currentUser?.calendar?.connected
                    ? `Google Calendar (${currentUser.calendar.mode === 'live' ? 'Live' : 'Demo'})`
                    : 'Local Sandbox Workspace'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>
                  {currentUser?.email || 'Anonymous Guest Session'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {onOpenAuth && (
                  <button
                    type="button"
                    onClick={onOpenAuth}
                    className="btn-secondary"
                    style={{
                      minHeight: '36px',
                      padding: '0 10px',
                      fontSize: '11.5px',
                    }}
                  >
                    {currentUser?.authenticated ? 'Account' : 'Sign in'}
                  </button>
                )}
                <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect width="18" height="18" x="3" y="4" rx="2" />
                    <path d="M3 10h18" />
                    <path d="M8 2v4" />
                    <path d="M16 2v4" />
                  </svg>
                </span>
              </div>
            </div>

            {/* API Usage & Cost */}
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>
                  Nebius API Telemetry
                </div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginTop: '2px' }}>
                  {usageStats?.total_requests ?? 0} calls ·{' '}
                  {usageStats?.total_estimated_cost_usd !== undefined
                    ? `$${Number(usageStats.total_estimated_cost_usd).toFixed(5)}`
                    : '$0.00000'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>
                  Nebius Token Factory · Nemotron-3 MoE
                </div>
              </div>
              <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Task Creation Modal */}
      {showAddModal && (
        <AddDeadlineModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false)
            if (onTasksUpdated) {
              onTasksUpdated()
            }
          }}
          defaultDomain={selectedDomainFilter !== 'all' ? selectedDomainFilter : 'general'}
          tasks={cleanTasks}
          customDomains={customDomains}
          onOpenCompass={onOpenCompass}
        />
      )}
    </div>
  )
}
