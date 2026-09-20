import React, { useState, useEffect, useCallback } from 'react'
import {
  fetchCalendarStatus,
  fetchCalendarAvailability,
  proposeSchedule,
  commitSchedule,
  getCalendarExportUrl,
  getGoogleOAuthConnectUrl,
  disconnectCalendar,
  checkReactiveSchedule,
  syncCalendarNow,
  quickConnectUser,
  deleteTask,
} from '../api/client'

const DOMAIN_STYLES = {
  hackathon: {
    bg: 'rgba(245, 158, 11, 0.15)',
    border: '1px solid rgba(245, 158, 11, 0.45)',
    accent: '#f59e0b',
    text: '#fbbf24',
    badgeClass: 'badge-hackathon',
  },
  coursework: {
    bg: 'rgba(59, 130, 246, 0.15)',
    border: '1px solid rgba(59, 130, 246, 0.45)',
    accent: '#3b82f6',
    text: '#60a5fa',
    badgeClass: 'badge-coursework',
  },
  code: {
    bg: 'rgba(16, 185, 129, 0.15)',
    border: '1px solid rgba(16, 185, 129, 0.45)',
    accent: '#10b981',
    text: '#34d399',
    badgeClass: 'badge-code',
  },
  general: {
    bg: 'rgba(100, 116, 139, 0.15)',
    border: '1px solid rgba(100, 116, 139, 0.45)',
    accent: '#64748b',
    text: '#94a3b8',
    badgeClass: 'badge-general',
  },
}

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]

export default function CalendarView({ tasks, activeDomain, onTasksUpdated, onOpenAuthModal }) {
  const [calendarStatus, setCalendarStatus] = useState({ connected: false, mode: 'demo', account_email: 'demo-scholar@compass.ai' })
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date()
    return d.toISOString().split('T')[0]
  })
  const [busyIntervals, setBusyIntervals] = useState([])
  const [loadingAvailability, setLoadingAvailability] = useState(false)
  const [proposing, setProposing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [proposedPlan, setProposedPlan] = useState(null)
  const [bannerMessage, setBannerMessage] = useState(null)
  const [checkingReactive, setCheckingReactive] = useState(false)
  const [syncingCalendar, setSyncingCalendar] = useState(false)
  const [quickEmailInput, setQuickEmailInput] = useState('')
  const [showQuickModal, setShowQuickModal] = useState(false)
  const [showIcsModal, setShowIcsModal] = useState(false)

  // Sync calendar connection status & check URL callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('calendar_connected') === 'true') {
      const email = urlParams.get('email') || ''
      setBannerMessage({
        type: 'success',
        text: `✅ Google Calendar successfully connected via OAuth (${email || 'Live'})! Scheduled tasks will synchronize directly.`
      })
      if (email) {
        setCalendarStatus({
          connected: true,
          mode: 'live',
          account_email: email,
          label: `Google Calendar: ${email} (Live OAuth Connected)`,
        })
      }
      window.history.replaceState({}, document.title, window.location.pathname)
    }

    fetchCalendarStatus().then(status => {
      if (status) setCalendarStatus(status)
    })
  }, [])


  // Fetch free/busy intervals for selected date
  const loadAvailability = useCallback(async (dateStr) => {
    setLoadingAvailability(true)
    try {
      const nextDate = new Date(dateStr)
      nextDate.setDate(nextDate.getDate() + 1)
      const nextDateStr = nextDate.toISOString().split('T')[0]

      const data = await fetchCalendarAvailability(dateStr, nextDateStr)
      if (data && Array.isArray(data.busy_intervals)) {
        setBusyIntervals(data.busy_intervals)
      }
    } catch (e) {
      console.warn('Could not load availability:', e)
    } finally {
      setLoadingAvailability(false)
    }
  }, [])

  useEffect(() => {
    loadAvailability(selectedDate)
  }, [selectedDate, loadAvailability])

  // Filter tasks that have scheduled_start matching selectedDate
  const scheduledForSelectedDay = tasks.filter(t => {
    if (!t.scheduled_start) return false
    const taskDate = t.scheduled_start.split('T')[0]
    const matchesDomain = activeDomain === 'all' || t.domain === activeDomain
    return taskDate === selectedDate && matchesDomain
  })

  // Filter unplaced / unscheduled tasks
  const unscheduledTasks = tasks.filter(t => {
    const isUnplaced = !t.scheduled_start
    const matchesDomain = activeDomain === 'all' || t.domain === activeDomain
    const isOpen = (t.status || 'open') !== 'done'
    return isUnplaced && matchesDomain && isOpen
  })

  // External calendar events for selectedDate
  const externalEventsForDay = busyIntervals.filter(b => {
    if (!b.start) return false
    const bDate = b.start.split('T')[0]
    return bDate === selectedDate && b.source === 'google_calendar'
  })

  // Calculate top and height percentage for 08:00 - 20:00 (12 hours = 720 minutes)
  const getEventPosition = (startIso, endIso) => {
    try {
      const start = new Date(startIso)
      const end = new Date(endIso)
      const startMinutes = start.getUTCHours() * 60 + start.getUTCMinutes()
      const endMinutes = end.getUTCHours() * 60 + end.getUTCMinutes()

      const gridStart = 8 * 60 // 08:00 = 480 mins
      const gridEnd = 20 * 60  // 20:00 = 1200 mins
      const totalMinutes = gridEnd - gridStart

      const top = Math.max(0, ((startMinutes - gridStart) / totalMinutes) * 100)
      const height = Math.max(4, ((endMinutes - startMinutes) / totalMinutes) * 100)

      return { top: `${top}%`, height: `${height}%` }
    } catch {
      return { top: '0%', height: '10%' }
    }
  }

  // Handle Propose Schedule
  const handleAutoSchedule = async () => {
    setProposing(true)
    setBannerMessage(null)
    try {
      const result = await proposeSchedule({
        targetDate: selectedDate,
        domain: activeDomain,
      })
      setProposedPlan(result)
    } catch (err) {
      setBannerMessage({ type: 'error', text: `Failed to propose schedule: ${err.message}` })
    } finally {
      setProposing(false)
    }
  }

  // Handle Commit Schedule
  const handleCommitPlan = async () => {
    if (!proposedPlan || !proposedPlan.scheduled || proposedPlan.scheduled.length === 0) return
    setCommitting(true)
    try {
      const assignments = proposedPlan.scheduled.map(s => ({
        task_id: s.task_id,
        scheduled_start: s.scheduled_start,
        scheduled_end: s.scheduled_end,
      }))
      await commitSchedule(assignments, proposedPlan.summary)
      setBannerMessage({
        type: 'success',
        text: `✅ Successfully slotted ${assignments.length} tasks and synced to Google Calendar!`
      })
      setProposedPlan(null)
      if (onTasksUpdated) onTasksUpdated()
      loadAvailability(selectedDate)
    } catch (err) {
      setBannerMessage({ type: 'error', text: `Error committing schedule: ${err.message}` })
    } finally {
      setCommitting(false)
    }
  }

  const handleCheckReactive = async () => {
    setCheckingReactive(true)
    try {
      const res = await checkReactiveSchedule()
      if (res.slipped_count > 0) {
        setBannerMessage({
          type: 'warning',
          text: `⚠️ Detected ${res.slipped_count} slipped task(s) past scheduled end time! Reactive re-plan staged with cascading dependencies (Run ID: ${res.run_id || 'staged'}).`
        })
        if (onTasksUpdated) onTasksUpdated()
      } else {
        setBannerMessage({
          type: 'success',
          text: '✅ Schedule is currently on track — no uncompleted tasks have slipped past their end time.'
        })
      }
    } catch (e) {
      setBannerMessage({
        type: 'error',
        text: `Error checking schedule slips: ${e.message}`
      })
    } finally {
      setCheckingReactive(false)
    }
  }

  // Generate 7 days for the date selector
  const dayTabs = []
  const today = new Date()
  for (let i = -2; i < 5; i++) {
    const d = new Date()
    d.setDate(today.getDate() + i)
    const isoStr = d.toISOString().split('T')[0]
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' })
    const dayNum = d.getDate()
    dayTabs.push({ iso: isoStr, label: `${dayName} ${dayNum}`, isToday: i === 0 })
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg-app)' }}>
      {/* Top Header Bar */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-card)',
        flexShrink: 0
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
              🗓️ Dynamic Schedule & Google Calendar
            </h2>
            <div
              onClick={() => {
                if (onOpenAuthModal) onOpenAuthModal()
                else setShowQuickModal(true)
              }}
              title="Click to switch account or manage Google Calendar"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '12px',
                background: calendarStatus.connected && calendarStatus.mode === 'live' ? 'var(--code-bg)' : 'var(--hackathon-bg)',
                border: calendarStatus.connected && calendarStatus.mode === 'live' ? '1px solid rgba(20, 184, 132, 0.4)' : '1px solid rgba(245, 166, 35, 0.4)',
                fontSize: '11px',
                color: calendarStatus.connected && calendarStatus.mode === 'live' ? 'var(--code-text)' : 'var(--hackathon-text)',
                fontWeight: '600',
                cursor: 'pointer'
              }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: calendarStatus.connected && calendarStatus.mode === 'live' ? '#10b981' : '#f5a623'
              }} />
              {calendarStatus.connected && calendarStatus.mode === 'live'
                ? `Google Calendar: ${calendarStatus.account_email} (Live OAuth Connected)`
                : `Google Calendar: ${calendarStatus.account_email || 'demo-scholar@compass.ai'} (simulated / demo mode — click to link)`}
            </div>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Deterministic Python interval slot allocator · Working hours (09:00–18:00) · 15m inter-task buffer
            {calendarStatus.mode === 'demo' && ' · Simulated calendar commitments (live OAuth available)'}
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            id="btn-sync-gcal"
            onClick={async () => {
              setSyncingCalendar(true)
              setBannerMessage(null)
              try {
                const res = await syncCalendarNow()
                if (res.is_live) {
                  setBannerMessage({
                    type: 'success',
                    text: `✅ Synced ${res.live_count || res.count || 0} scheduled tasks directly to your Google Calendar (${calendarStatus.account_email})!`
                  })
                } else {
                  setBannerMessage({
                    type: 'info',
                    text: `ℹ️ ${res.message || `Slotted ${res.count || 0} tasks in Compass.`}`
                  })
                  setShowIcsModal(true)
                }
                loadAvailability(selectedDate)
              } catch (err) {
                setBannerMessage({
                  type: 'error',
                  text: `Failed to sync: ${err.message}`
                })
              } finally {
                setSyncingCalendar(false)
              }
            }}
            disabled={syncingCalendar}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              borderRadius: '8px',
              background: calendarStatus.connected && calendarStatus.mode === 'live' ? 'var(--code-bg)' : 'var(--coursework-bg)',
              border: calendarStatus.connected && calendarStatus.mode === 'live' ? '1px solid var(--code)' : '1px solid var(--coursework)',
              color: calendarStatus.connected && calendarStatus.mode === 'live' ? 'var(--code-text)' : 'var(--coursework-text)',
              fontSize: '12px',
              fontWeight: '600',
              cursor: syncingCalendar ? 'wait' : 'pointer',
              transition: 'all 0.15s ease'
            }}>
            {syncingCalendar ? '🔄 Syncing...' : (calendarStatus.connected && calendarStatus.mode === 'live' ? '📅 Sync to Google Calendar' : '📅 Slot / Sync Tasks')}
          </button>

          {calendarStatus.connected ? (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <a
                href="https://calendar.google.com"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '7px 10px',
                  borderRadius: '8px',
                  background: 'var(--bg-card-soft)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  textDecoration: 'none'
                }}>
                Open Calendar ↗
              </a>
              {calendarStatus.mode !== 'live' && (
                <a
                  id="btn-connect-google"
                  href={getGoogleOAuthConnectUrl()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 12px',
                    borderRadius: '8px',
                    background: 'var(--coursework-bg)',
                    border: '1px solid var(--coursework)',
                    color: 'var(--coursework-text)',
                    fontSize: '12px',
                    fontWeight: '600',
                    textDecoration: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}>
                  🔗 Sign in with Google
                </a>
              )}
              <button
                id="btn-disconnect-google"
                onClick={async () => {
                  await disconnectCalendar()
                  setCalendarStatus({ connected: false, mode: 'demo', account_email: 'demo-scholar@compass.ai' })
                  loadAvailability(selectedDate)
                }}
                style={{
                  padding: '7px 10px',
                  borderRadius: '8px',
                  background: 'var(--danger-bg)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#dc2626',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}>
                Disconnect
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                id="btn-connect-google"
                onClick={() => {
                  if (onOpenAuthModal) onOpenAuthModal()
                  else setShowQuickModal(true)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 12px',
                  borderRadius: '8px',
                  background: 'var(--coursework-bg)',
                  border: '1px solid var(--coursework)',
                  color: 'var(--coursework-text)',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}>
                🔗 Connect Google Calendar
              </button>
              <button
                id="btn-quick-login"
                onClick={() => {
                  if (onOpenAuthModal) onOpenAuthModal()
                  else setShowQuickModal(true)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '7px 10px',
                  borderRadius: '8px',
                  background: 'var(--bg-card-soft)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}>
                ⚡ Switch Account
              </button>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <a
              id="btn-export-ics"
              href={getCalendarExportUrl(activeDomain)}
              download="compass_schedule.ics"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                borderRadius: '8px',
                background: 'var(--bg-card-soft)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontSize: '12px',
                fontWeight: '500',
                textDecoration: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}>
              📥 Export .ics Feed
            </a>
            <button
              onClick={() => setShowIcsModal(true)}
              title="How to import into Google Calendar"
              style={{
                background: 'var(--bg-card-soft)',
                border: '1px solid var(--border)',
                color: 'var(--coursework-text)',
                borderRadius: '8px',
                padding: '7px 10px',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: '600'
              }}>
              Sync Guide
            </button>
          </div>

          <button
            id="btn-check-slipped"
            onClick={handleCheckReactive}
            disabled={checkingReactive}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              borderRadius: '8px',
              background: 'var(--hackathon-bg)',
              border: '1px solid rgba(245, 166, 35, 0.4)',
              color: 'var(--hackathon-text)',
              fontSize: '12px',
              fontWeight: '600',
              cursor: checkingReactive ? 'wait' : 'pointer',
              transition: 'all 0.15s ease'
            }}>
            {checkingReactive ? '🔄 Scanning...' : '⚡ Scan Schedule Slip'}
          </button>

          <button
            id="btn-auto-schedule"
            onClick={handleAutoSchedule}
            disabled={proposing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #6c5ce7, #8b5cf6)',
              border: 'none',
              color: '#ffffff',
              fontSize: '12.5px',
              fontWeight: '600',
              cursor: proposing ? 'wait' : 'pointer',
              boxShadow: 'var(--shadow-sm)',
              opacity: proposing ? 0.7 : 1,
              transition: 'all 0.15s ease'
            }}>
            {proposing ? '⚡ Optimizing Slots...' : '⚡ Auto-Schedule Unplaced Tasks'}
          </button>
        </div>
      </div>

      {/* Status Notifications Banner */}
      {bannerMessage && (
        <div style={{
          padding: '10px 24px',
          background: bannerMessage.type === 'error' ? 'var(--danger-bg)' : 'var(--code-bg)',
          borderBottom: bannerMessage.type === 'error' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(20, 184, 132, 0.3)',
          color: bannerMessage.type === 'error' ? '#b91c1c' : 'var(--code-text)',
          fontSize: '12.5px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{bannerMessage.text}</span>
          <button
            onClick={() => setBannerMessage(null)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '14px' }}>
            ✕
          </button>
        </div>
      )}

      {/* Date Horizon Navigator */}
      <div style={{
        padding: '10px 24px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'var(--bg-card-soft)',
        flexShrink: 0
      }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', marginRight: '8px' }}>
          HORIZON:
        </span>
        {dayTabs.map(tab => {
          const isSelected = selectedDate === tab.iso
          return (
            <button
              key={tab.iso}
              onClick={() => setSelectedDate(tab.iso)}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                border: isSelected ? '1px solid var(--brand)' : '1px solid var(--border)',
                background: isSelected ? 'var(--brand)' : 'var(--bg-card)',
                color: isSelected ? '#16152a' : 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: isSelected ? '700' : '500',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}>
              {tab.label} {tab.isToday && '•'}
            </button>
          )
        })}
      </div>

      {/* Main Grid & Task Allocation View */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* Left Side: 08:00 - 20:00 Time Grid */}
        <div style={{
          flex: '1 1 70%',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--border)',
          overflowY: 'auto',
          position: 'relative'
        }}>
          <div style={{
            position: 'relative',
            minHeight: '720px',
            padding: '10px 20px 20px 70px',
            background: 'var(--bg-app)'
          }}>
            {/* Hour Markers */}
            {HOURS.map((hour) => (
              <div
                key={hour}
                style={{
                  height: '60px',
                  borderTop: '1px solid var(--border)',
                  position: 'relative'
                }}>
                <span style={{
                  position: 'absolute',
                  left: '-55px',
                  top: '-9px',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  fontFamily: 'JetBrains Mono, monospace'
                }}>
                  {String(hour).padStart(2, '0')}:00
                </span>
              </div>
            ))}

            {/* External Google Calendar Busy Blocks */}
            {externalEventsForDay.map(ev => {
              const pos = getEventPosition(ev.start, ev.end)
              return (
                <div
                  key={ev.id}
                  style={{
                    position: 'absolute',
                    left: '80px',
                    right: '20px',
                    top: pos.top,
                    height: pos.height,
                    background: 'rgba(22, 21, 42, 0.05)',
                    border: '1px dashed var(--border)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    zIndex: 2,
                    backdropFilter: 'blur(4px)'
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px' }}>📅 Google Calendar:</span>
                    <strong style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{ev.title}</strong>
                  </div>
                  <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {ev.start.slice(11, 16)} - {ev.end.slice(11, 16)} UTC (Busy Window)
                  </span>
                </div>
              )
            })}

            {/* Scheduled Compass Tasks */}
            {scheduledForSelectedDay.map(task => {
              const pos = getEventPosition(task.scheduled_start, task.scheduled_end)
              const style = DOMAIN_STYLES[task.domain] || DOMAIN_STYLES.general
              return (
                <div
                  key={task.id}
                  style={{
                    position: 'absolute',
                    left: '90px',
                    right: '30px',
                    top: pos.top,
                    height: pos.height,
                    background: style.bg,
                    border: style.border,
                    borderRadius: '8px',
                    padding: '8px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    zIndex: 4,
                    boxShadow: 'var(--shadow-sm)',
                    transition: 'transform 0.15s ease'
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={style.badgeClass} style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10.5px', fontWeight: '700' }}>
                        {task.domain.toUpperCase()}
                      </span>
                      <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{task.title}</strong>
                    </div>
                    <span style={{
                      fontSize: '11px',
                      color: calendarStatus.connected && calendarStatus.mode === 'live' ? '#10b981' : '#6c5ce7',
                      fontWeight: '700',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      {calendarStatus.connected && calendarStatus.mode === 'live' ? '✓ Synced' : '⏱ Slotted'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                    <span style={{ fontSize: '11px', color: style.text, fontFamily: 'JetBrains Mono, monospace' }}>
                      ⏰ {task.scheduled_start.slice(11, 16)} → {task.scheduled_end.slice(11, 16)} UTC ({task.duration_minutes || 60}m)
                    </span>
                    {task.project && (
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        📁 {task.project}
                      </span>
                    )}
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Prio: {task.priority || 'medium'}
                    </span>
                  </div>
                </div>
              )
            })}

            {scheduledForSelectedDay.length === 0 && externalEventsForDay.length === 0 && (
              <div style={{
                position: 'absolute',
                top: '35%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                color: 'var(--text-muted)'
              }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🗓️</div>
                <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>No tasks or events scheduled for this day</p>
                <p style={{ fontSize: '12px', marginTop: '4px', color: 'var(--text-secondary)' }}>Click "Auto-Schedule Unplaced Tasks" to automatically place open tasks into working hours.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Unscheduled Tasks & Working Constraints */}
        <div style={{
          flex: '0 0 30%',
          minWidth: '280px',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-card)',
          borderLeft: '1px solid var(--border)',
          padding: '16px',
          overflowY: 'auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)', fontWeight: '700' }}>
              Pending Tasks ({unscheduledTasks.length})
            </h3>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Unscheduled</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
            {unscheduledTasks.map(task => {
              const style = DOMAIN_STYLES[task.domain] || DOMAIN_STYLES.general
              return (
                <div
                  key={task.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'var(--bg-card-soft)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '12.5px', color: 'var(--text-primary)', fontWeight: '600' }}>
                      {task.title}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className={style.badgeClass} style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '700' }}>
                        {task.domain}
                      </span>
                      <button
                        title="Delete task/deadline"
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (window.confirm(`Delete "${task.title}"?`)) {
                            try {
                              await deleteTask(task.id)
                              if (onTasksUpdated) onTasksUpdated()
                            } catch (err) {
                              alert(`Failed to delete: ${err.message}`)
                            }
                          }
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'color 0.15s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      ⏱️ {task.duration_minutes || 60}m · {task.priority || 'medium'}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--hackathon-text)', fontWeight: '600' }}>
                      {task.countdown || 'Needs slot'}
                    </span>
                  </div>
                </div>
              )
            })}

            {unscheduledTasks.length === 0 && (
              <div style={{
                padding: '24px 16px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                background: 'var(--bg-card-soft)',
                borderRadius: '8px',
                border: '1px dashed var(--border)'
              }}>
                <span style={{ fontSize: '20px' }}>🎉</span>
                <p style={{ fontSize: '12px', marginTop: '6px', color: 'var(--text-secondary)' }}>All tasks are scheduled into calendar time slots!</p>
              </div>
            )}
          </div>

          {/* Allocation Rules & Constraints Widget */}
          <div style={{
            marginTop: 'auto',
            padding: '14px',
            borderRadius: '8px',
            background: 'var(--coursework-bg)',
            border: '1px solid rgba(108, 92, 231, 0.25)'
          }}>
            <h4 style={{ fontSize: '12px', fontWeight: '700', color: 'var(--coursework-text)', marginBottom: '8px' }}>
              ⚙️ Deterministic Policy
            </h4>
            <ul style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.6', paddingLeft: '14px' }}>
              <li>Working Window: 09:00 - 18:00 UTC</li>
              <li>Days: Monday - Friday (workdays)</li>
              <li>Inter-task buffer: 15 minutes</li>
              <li>LLM slot hallucinations: 0% (pure Python)</li>
              <li>Calendar sync: Instant RFC 5545 + Google</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Auto-Schedule Review & Confirmation Modal */}
      {proposedPlan && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(22, 21, 42, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(5px)'
        }}>
          <div style={{
            width: '580px',
            maxWidth: '90vw',
            background: 'var(--bg-card)',
            borderRadius: '16px',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)' }}>
                ⚡ Review Proposed Schedule Allocation
              </h3>
              <button
                onClick={() => setProposedPlan(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '16px', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              {proposedPlan.summary}
            </p>

            <div style={{
              maxHeight: '260px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              background: 'var(--bg-card-soft)',
              padding: '12px',
              borderRadius: '10px',
              border: '1px solid var(--border)'
            }}>
              {proposedPlan.scheduled && proposedPlan.scheduled.map(s => (
                <div
                  key={s.task_id}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                  <div>
                    <strong style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>{s.title}</strong>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Domain: {s.domain} · Duration: {s.duration_minutes}m
                    </div>
                  </div>
                  <span style={{ fontSize: '11.5px', color: 'var(--coursework-text)', fontFamily: 'JetBrains Mono, monospace', fontWeight: '700' }}>
                    {s.scheduled_start.slice(0, 10)} {s.scheduled_start.slice(11, 16)} → {s.scheduled_end.slice(11, 16)}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                onClick={() => setProposedPlan(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: 'var(--bg-card-soft)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}>
                Cancel
              </button>
              <button
                id="btn-confirm-commit-schedule"
                onClick={handleCommitPlan}
                disabled={committing}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: committing ? 'wait' : 'pointer',
                  boxShadow: '0 0 12px rgba(16, 185, 129, 0.3)'
                }}>
                {committing ? 'Committing...' : '✅ Approve & Commit to Google Calendar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Gmail Login Modal */}
      {showQuickModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(22, 21, 42, 0.45)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '28px',
            width: '100%',
            maxWidth: '420px',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontSize: '18px', fontWeight: '800' }}>⚡ Connect Your Gmail</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '0 0 20px', lineHeight: '1.5' }}>
              Enter your Gmail address to activate your schedule profile. Tasks will be slotted deterministically and can be imported or subscribed directly in Google Calendar.
            </p>
            <input
              id="input-quick-email"
              type="email"
              placeholder="e.g. yourname@gmail.com"
              value={quickEmailInput}
              onChange={(e) => setQuickEmailInput(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && quickEmailInput.includes('@')) {
                  await quickConnectUser(quickEmailInput)
                  setShowQuickModal(false)
                  fetchCalendarStatus().then(status => {
                    if (status) setCalendarStatus(status)
                  })
                  setBannerMessage({
                    type: 'success',
                    text: `✅ Connected as ${quickEmailInput}! Schedule slotted.`
                  })
                }
              }}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'var(--bg-app)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                marginBottom: '18px',
                boxSizing: 'border-box',
                outline: 'none'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowQuickModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: 'var(--bg-card-soft)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}>
                Cancel
              </button>
              <button
                id="btn-submit-quick-connect"
                disabled={!quickEmailInput.includes('@')}
                onClick={async () => {
                  try {
                    await quickConnectUser(quickEmailInput)
                    setShowQuickModal(false)
                    fetchCalendarStatus().then(status => {
                      if (status) setCalendarStatus(status)
                    })
                    setBannerMessage({
                      type: 'success',
                      text: `✅ Connected as ${quickEmailInput}! Schedule slotted.`
                    })
                  } catch (err) {
                    alert(`Could not connect: ${err.message}`)
                  }
                }}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  background: quickEmailInput.includes('@') ? 'linear-gradient(135deg, #2563eb, #3b82f6)' : 'var(--bg-card-soft)',
                  border: 'none',
                  color: quickEmailInput.includes('@') ? '#ffffff' : 'var(--text-muted)',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: quickEmailInput.includes('@') ? 'pointer' : 'not-allowed'
                }}>
                Connect Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Calendar Sync & .ics Import Guide Modal */}
      {showIcsModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(22, 21, 42, 0.45)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '28px',
            width: '100%',
            maxWidth: '520px',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '18px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🗓️ Sync Tasks to Google Calendar
              </h3>
              <button
                onClick={() => setShowIcsModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.5', margin: '0 0 16px' }}>
              Because direct Google Calendar API write requires registered Google Cloud OAuth credentials, you can sync all your scheduled tasks into your Google Calendar right now in 2 easy steps:
            </p>

            <div style={{ background: 'var(--bg-card-soft)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 8px', color: 'var(--coursework-text)', fontSize: '13px', fontWeight: '700' }}>
                Option 1: Instant 1-Click File Import (Recommended)
              </h4>
              <ol style={{ margin: '0 0 10px', paddingLeft: '18px', color: 'var(--text-primary)', fontSize: '12.5px', lineHeight: '1.6' }}>
                <li>
                  Click below to download the <code style={{ color: 'var(--coursework-text)' }}>compass_schedule.ics</code> file:
                  <div style={{ marginTop: '6px', marginBottom: '6px' }}>
                    <a
                      href={getCalendarExportUrl(activeDomain)}
                      download="compass_schedule.ics"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                        borderRadius: '6px',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: '700',
                        textDecoration: 'none'
                      }}>
                      📥 Download compass_schedule.ics
                    </a>
                  </div>
                </li>
                <li>In Google Calendar, look at the left sidebar under <b>Other calendars</b> and click <b>+</b>.</li>
                <li>Click <b>Import</b>, select the downloaded file, and click <b>Import</b>.</li>
                <li>All scheduled tasks immediately appear in your Google Calendar!</li>
              </ol>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', marginTop: '10px' }}>
                <h4 style={{ margin: '0 0 8px', color: 'var(--code-text)', fontSize: '13px', fontWeight: '700' }}>
                  Option 2: Live Auto-Sync via Calendar Subscription URL
                </h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '0 0 8px' }}>
                  In Google Calendar &gt; <b>Other calendars (+)</b> &gt; <b>From URL</b>, paste this feed URL:
                </p>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    readOnly
                    value={`${window.location.origin}/api/calendar/export.ics`}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: '6px',
                      background: 'var(--bg-app)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      fontSize: '11.5px',
                      fontFamily: 'JetBrains Mono, monospace'
                    }}
                  />
                  <button
                    onClick={(e) => {
                      navigator.clipboard.writeText(`${window.location.origin}/api/calendar/export.ics`)
                      e.target.innerText = 'Copied! ✓'
                      setTimeout(() => { e.target.innerText = 'Copy' }, 2000)
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}>
                    Copy
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <a
                href="https://calendar.google.com"
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: 'var(--bg-card-soft)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  fontWeight: '600',
                  textDecoration: 'none'
                }}>
                Open Google Calendar ↗
              </a>
              <button
                onClick={() => setShowIcsModal(false)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
