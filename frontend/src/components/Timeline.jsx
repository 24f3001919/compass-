import React, { useState } from 'react'
import {
  deleteTask,
  updateTask,
  seedJudgeDemoPersona,
  verifyAllDeadlines,
} from '../api/client'
import OnboardingTour from './OnboardingTour'
import { getDomainMeta } from './timeline/domainMeta'
import TaskCard from './timeline/TaskCard'
import TaskDetailModal from './timeline/TaskDetailModal'
import AddDeadlineModal from './timeline/AddDeadlineModal'
import DarkModeToggle from './DarkModeToggle'

// Re-export for backward compatibility
export { getDomainMeta } from './timeline/domainMeta'

export default function Timeline({
  tasks = [],
  allTasks = [],
  activeDomain,
  onSelectDomain,
  onTasksUpdated,
  onOpenCompass,
  onOpenTelemetry,
  customDomains = [],
  theme = 'light',
  onToggleTheme,
  isDarkMode,
  onToggleDarkMode,
}) {
  const darkMode = typeof isDarkMode === 'boolean' ? isDarkMode : theme === 'dark'
  const toggleDark = onToggleDarkMode || onToggleTheme
  const [selectedTask, setSelectedTask] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [seedingPersona, setSeedingPersona] = useState(false)
  const [seedSuccess, setSeedSuccess] = useState(false)
  const [verifyingDeadlines, setVerifyingDeadlines] = useState(false)
  const [verificationSummary, setVerificationSummary] = useState(null)

  const handleVerifyAll = async () => {
    setVerifyingDeadlines(true)
    setVerificationSummary(null)
    try {
      const res = await verifyAllDeadlines()
      if (res && res.verifications) {
        const driftCount = res.verifications.filter(v => v.result?.data?.drift_analysis?.has_drift).length
        const accurateCount = res.verifications.filter(v => v.result?.data?.drift_analysis?.drift_verdict === 'CONFIRMED_ACCURATE').length
        setVerificationSummary({
          total: res.verifications.length,
          drift: driftCount,
          accurate: accurateCount,
          details: res.verifications,
        })
      }
      if (onTasksUpdated) onTasksUpdated()
    } catch (err) {
      setVerificationSummary({ error: err.message || 'Verification failed' })
    } finally {
      setVerifyingDeadlines(false)
    }
  }

  const handleSeedJudgePersona = async () => {
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
  }

  const handleDelete = async (taskId) => {
    try {
      await deleteTask(taskId)
      if (onTasksUpdated) {
        onTasksUpdated()
      }
    } catch (err) {
      alert(`Failed to delete deadline: ${err.message}`)
      throw err
    }
  }

  const handleToggleStatus = async (taskId, isCompleted) => {
    try {
      await updateTask(taskId, { status: isCompleted ? 'open' : 'completed' })
      if (onTasksUpdated) onTasksUpdated()
    } catch (err) {
      console.warn('Failed to toggle status:', err)
    }
  }

  const domainMeta = activeDomain !== 'all' ? getDomainMeta(activeDomain) : null
  const filtered = activeDomain === 'all'
    ? tasks
    : tasks.filter(t => (t.domain || 'general').toLowerCase().trim() === activeDomain)
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  const hasFallbackTasks = Array.isArray(tasks) && tasks.some(t => t.is_fallback)

  return (
    <div className="timeline-container" style={{ background: 'var(--bg-app)' }}>
      {hasFallbackTasks && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'rgba(245, 166, 35, 0.08)',
          border: '1px solid rgba(245, 166, 35, 0.25)',
          borderRadius: 'var(--radius-card, 8px)',
          marginBottom: '18px',
          fontSize: '13px',
          color: 'var(--text-primary)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent, #f5a623)' }}>
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span><strong>Demo / Offline Mode:</strong> Backend server is offline or starting up. Displaying sample tasks. Your local actions will sync once connected.</span>
          </div>
          <span style={{ fontSize: '11px', background: 'rgba(245, 166, 35, 0.15)', color: 'var(--text-primary)', padding: '3px 8px', borderRadius: 'var(--radius-btn, 6px)', fontWeight: '600' }}>Demo Data</span>
        </div>
      )}

      {/* Header with Heading, Dark Mode Toggle, and Action Buttons */}
      <div style={{ marginBottom: '22px' }}>
        {/* Top Row: Title / Subtitle on Left, Dark Mode Toggle on Right */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '26px', fontWeight: '600', color: 'var(--text-primary)', letterSpacing: '-0.3px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {domainMeta ? (
                  <>
                    <span className="domain-swatch" style={{ background: domainMeta.color, width: '12px', height: '12px' }} />
                    <span>{domainMeta.label} Domain</span>
                  </>
                ) : (
                  <span>Timeline Feed</span>
                )}
                <span style={{ color: 'var(--text-secondary)', fontWeight: '400', fontSize: '15px' }}>, {today}</span>
              </h2>
              {domainMeta && (
                <button
                  type="button"
                  id="btn-return-all-domains"
                  onClick={() => onSelectDomain('all')}
                  className="btn-secondary"
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    minHeight: '36px',
                  }}
                  title="View all domains"
                >
                  ← View all
                </button>
              )}
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: 0 }}>
              {domainMeta
                ? `Deadlines, context, and focus allocation for ${domainMeta.label}`
                : "What's happening across your workspace today"}
            </p>
          </div>

          <div style={{ flexShrink: 0 }}>
            <DarkModeToggle
              isDarkMode={darkMode}
              onToggleDarkMode={toggleDark}
              id="timeline-theme-toggle"
            />
          </div>
        </div>

        {/* Action Buttons Row Below: 1 primary amber, others secondary */}
        <div className="timeline-actions-group" style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {onOpenTelemetry && (
            <button
              id="btn-open-telemetry"
              type="button"
              onClick={onOpenTelemetry}
              className="btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                minHeight: '44px',
                padding: '0 14px',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
              }}
              title="Inspect live Nebius Token Factory token consumption and NVIDIA model hierarchy"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent, #f5a623)' }}>
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              <span>Nebius & NVIDIA Telemetry</span>
            </button>
          )}

          <button
            id="btn-verify-all-deadlines"
            type="button"
            onClick={handleVerifyAll}
            disabled={verifyingDeadlines}
            className="btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              minHeight: '44px',
              padding: '0 14px',
              fontSize: '13px',
              fontWeight: '500',
              cursor: verifyingDeadlines ? 'wait' : 'pointer',
            }}
            title="Proactively verify open deadlines across the live web using Tavily search"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {verifyingDeadlines ? (
                <circle cx="12" cy="12" r="10" />
              ) : (
                <>
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </>
              )}
            </svg>
            <span>{verifyingDeadlines ? 'Verifying with Tavily...' : 'Verify with Tavily'}</span>
          </button>

          <button
            id="btn-seed-judge-persona"
            type="button"
            onClick={handleSeedJudgePersona}
            disabled={seedingPersona}
            className="btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              minHeight: '44px',
              padding: '0 14px',
              fontSize: '13px',
              fontWeight: '500',
              cursor: seedingPersona ? 'wait' : 'pointer',
            }}
            title="1-Click Demo: Populates sample multi-domain tasks and vector memory for hackathon judges"
          >
            {seedSuccess ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--domain-code, #1c8a62)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
              </svg>
            )}
            <span>{seedingPersona ? 'Loading...' : seedSuccess ? 'Demo Persona Loaded!' : 'Load Judge Persona'}</span>
          </button>

          <button
            id="btn-add-deadline"
            onClick={() => setShowAddModal(true)}
            className="btn-primary-amber"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              minHeight: '44px',
              padding: '0 18px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add deadline</span>
          </button>
        </div>
      </div>

      {/* Verification Feedback Banner */}
      {verificationSummary && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          padding: '12px 18px',
          borderRadius: 'var(--radius-card, 8px)',
          marginBottom: '20px',
          fontSize: '13px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {verificationSummary.error ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #f5a623)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            )}
            <div>
              <span style={{ fontWeight: '600' }}>
                {verificationSummary.error
                  ? 'Verification note: '
                  : 'Schedules verified: '
                }
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                {verificationSummary.error
                  ? verificationSummary.error
                  : `${verificationSummary.total} active deadline(s) checked. ${
                      verificationSummary.drift > 0
                        ? `${verificationSummary.drift} update(s) detected via live web search.`
                        : 'All deadlines confirmed matching official dates.'
                    }`
                }
              </span>
            </div>
          </div>
          <button
            onClick={() => setVerificationSummary(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Dismiss verification note"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Judge Onboarding & Architectural Tour */}
      <OnboardingTour
        onVerifyDeadlines={handleVerifyAll}
        onOpenTelemetry={onOpenTelemetry}
        onOpenCompass={onOpenCompass}
        onOpenSeed={handleSeedJudgePersona}
      />

      {/* Filter pills: horizontal scroll on mobile, 6px radius, min 44px tap target, domain swatch */}
      <div
        className="domain-filter-pills-row quick-prompts-scroll"
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '20px',
          overflowX: 'auto',
          overflowY: 'hidden',
          paddingBottom: '4px',
          maxWidth: '100%',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {(() => {
          const basePills = ['all', 'hackathon', 'coursework', 'code', 'general', 'other']
          const customPills = [
            ...customDomains.map(d => d.key),
            ...tasks.map(t => (t.domain || '').toLowerCase().trim()),
            ...allTasks.map(t => (t.domain || '').toLowerCase().trim()),
          ].filter(d => d && !basePills.includes(d))
          const uniquePills = Array.from(new Set([...basePills, ...customPills]))

          return uniquePills.map(dom => {
            const pillMeta = dom === 'all' ? { label: 'All' } : getDomainMeta(dom)
            const isSelected = activeDomain === dom
            return (
              <button
                key={dom}
                id={`filter-pill-${dom}`}
                onClick={() => onSelectDomain(dom)}
                className={`filter-pill ${isSelected ? 'active' : ''}`}
                style={{
                  flexShrink: 0,
                  minHeight: '44px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '0 14px',
                  fontSize: '13px',
                  fontWeight: isSelected ? '600' : '400',
                  borderRadius: 'var(--radius-btn, 6px)',
                }}
              >
                {dom !== 'all' && pillMeta.color && (
                  <span
                    className="domain-swatch"
                    style={{ background: pillMeta.color }}
                  />
                )}
                {pillMeta.label}
              </button>
            )
          })
        })()}
      </div>

      {/* Task Stream Feed */}
      <div className="timeline-feed">
        {filtered.length === 0 ? (
          <div style={{
            padding: '48px 20px',
            textAlign: 'center',
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-card, 8px)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            marginTop: '10px',
            width: '100%',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px', color: 'var(--text-secondary)' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
              </svg>
            </div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
              {activeDomain === 'all' ? 'No deadlines yet' : 'Nothing here yet'}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '18px' }}>
              {activeDomain === 'all'
                ? 'Add your first deadline or load the Judge Persona to explore demo data.'
                : `No deadlines in ${getDomainMeta(activeDomain).label} yet. Add a deadline and it'll show up here.`}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                id="btn-empty-add-deadline"
                onClick={() => setShowAddModal(true)}
                className="btn-primary-amber"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  minHeight: '44px',
                  padding: '0 18px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Add deadline</span>
              </button>
              <button
                id="btn-empty-load-demo"
                type="button"
                onClick={handleSeedJudgePersona}
                disabled={seedingPersona}
                className="btn-secondary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  minHeight: '44px',
                  padding: '0 14px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: seedingPersona ? 'wait' : 'pointer',
                }}
              >
                {seedSuccess ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--domain-code, #1c8a62)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="6" />
                    <circle cx="12" cy="12" r="2" />
                  </svg>
                )}
                <span>{seedingPersona ? 'Loading...' : seedSuccess ? 'Demo Persona Loaded!' : 'Load Judge Persona'}</span>
              </button>
            </div>
          </div>
        ) : filtered.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            onSelectTask={setSelectedTask}
            onDeleteTask={handleDelete}
            onToggleStatus={handleToggleStatus}
          />
        ))}
      </div>

      <TaskDetailModal
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onDelete={handleDelete}
        onUpdated={() => {
          setSelectedTask(null)
          if (onTasksUpdated) onTasksUpdated()
        }}
      />

      <AddDeadlineModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={onTasksUpdated}
        defaultDomain={activeDomain}
        tasks={tasks}
        customDomains={customDomains}
        onOpenCompass={onOpenCompass}
      />
    </div>
  )
}
