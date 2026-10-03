import React, { useState, useMemo } from 'react'
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
import {
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Sparkles,
  Cpu,
  ShieldCheck,
  Calendar,
  Filter,
  Layers,
  ArrowRight,
  TrendingUp,
  BrainCircuit,
  Zap,
} from 'lucide-react'

// Re-export for backward compatibility
export { getDomainMeta } from './timeline/domainMeta'

export default function Timeline({
  tasks = [],
  activeDomain,
  onSelectDomain,
  onTasksUpdated,
  onOpenNorthstar,
  onOpenTelemetry,
}) {
  const [selectedTask, setSelectedTask] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [seedingPersona, setSeedingPersona] = useState(false)
  const [seedSuccess, setSeedSuccess] = useState(false)
  const [verifyingDeadlines, setVerifyingDeadlines] = useState(false)
  const [verificationSummary, setVerificationSummary] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'open' | 'completed' | 'urgent'
  const [quickAiPrompt, setQuickAiPrompt] = useState('')

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
      if (onTasksUpdated) onTasksUpdated()
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

  // Executive Metric Calculations
  const metrics = useMemo(() => {
    const total = tasks.length
    const completed = tasks.filter(t => t.status === 'completed' || t.status === 'done').length
    const open = total - completed
    const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0
    const overdue = tasks.filter(t => (t.countdown || '').toLowerCase().includes('overdue')).length
    const urgent = tasks.filter(t => {
      const prio = String(t.priority || '').toLowerCase()
      const cd = String(t.countdown || '').toLowerCase()
      return prio === 'urgent' || cd.includes('today') || cd.includes('hour') || cd.includes('overdue')
    }).length

    const openTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'done')
    const focusMinutes = openTasks.reduce((sum, t) => sum + (Number(t.duration_minutes) || 45), 0)
    const focusHours = (focusMinutes / 60).toFixed(1)

    return { total, completed, open, progressPct, overdue, urgent, focusHours }
  }, [tasks])

  // Multi-dimensional Filtering: Domain + Search Query + Status Filter
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      // Domain filter
      if (activeDomain !== 'all' && t.domain !== activeDomain) return false

      // Status filter
      const isComp = t.status === 'completed' || t.status === 'done'
      if (statusFilter === 'open' && isComp) return false
      if (statusFilter === 'completed' && !isComp) return false
      if (statusFilter === 'urgent') {
        const isUrg = String(t.priority || '').toLowerCase() === 'urgent' ||
                      (t.countdown || '').toLowerCase().includes('overdue') ||
                      (t.countdown || '').toLowerCase().includes('today')
        if (!isUrg) return false
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = (t.title || '').toLowerCase().includes(q)
        const matchDesc = (t.description || '').toLowerCase().includes(q)
        const matchProj = (t.project || '').toLowerCase().includes(q)
        const matchTags = Array.isArray(t.tags) && t.tags.some(tag => tag.toLowerCase().includes(q))
        if (!matchTitle && !matchDesc && !matchProj && !matchTags) return false
      }

      return true
    })
  }, [tasks, activeDomain, statusFilter, searchQuery])

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  const hasFallbackTasks = Array.isArray(tasks) && tasks.some(t => t.is_fallback)

  const handleQuickAiSubmit = (e) => {
    e.preventDefault()
    if (!quickAiPrompt.trim()) return
    if (onOpenNorthstar) {
      onOpenNorthstar(quickAiPrompt)
      setQuickAiPrompt('')
    }
  }

  return (
    <div className="timeline-container" style={{ background: '#f8fafc', padding: '28px 32px' }}>
      {/* Offline / Demo Warning if applicable */}
      {hasFallbackTasks && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '10px',
            marginBottom: '20px',
            fontSize: '12.5px',
            color: '#b45309',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={16} color="#f59e0b" />
            <span>
              <strong>Demo Mode:</strong> Backend server is connecting. Displaying sample tasks.
            </span>
          </div>
          <span
            style={{
              fontSize: '11px',
              background: 'rgba(245, 158, 11, 0.2)',
              padding: '2px 8px',
              borderRadius: '6px',
              fontWeight: '700',
            }}
          >
            Demo Context
          </span>
        </div>
      )}

      {/* Top Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '24px',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2
              style={{
                fontSize: '26px',
                fontWeight: '800',
                color: '#0f172a',
                letterSpacing: '-0.5px',
                margin: 0,
              }}
            >
              Executive Dashboard
            </h2>
            <span
              style={{
                fontSize: '12px',
                fontWeight: '600',
                color: '#64748b',
                background: '#e2e8f0',
                padding: '2px 8px',
                borderRadius: '6px',
              }}
            >
              {today}
            </span>
          </div>
          <p style={{ fontSize: '13.5px', color: '#64748b', marginTop: '4px', marginBottom: 0 }}>
            Unified view of cross-domain deadlines, focus allocation, and cognitive guardrails.
          </p>
        </div>

        {/* Global Executive Actions */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {onOpenTelemetry && (
            <button
              id="btn-open-telemetry"
              type="button"
              onClick={onOpenTelemetry}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                background: '#ffffff',
                color: '#0f172a',
                border: '1px solid #e2e8f0',
                padding: '9px 14px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#cbd5e1'
                e.currentTarget.style.background = '#f8fafc'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#e2e8f0'
                e.currentTarget.style.background = '#ffffff'
              }}
              title="Inspect live Nebius Token Factory token consumption and NVIDIA MoE hierarchy"
            >
              <Cpu size={15} color="#f59e0b" />
              <span>Nebius Telemetry</span>
            </button>
          )}

          <button
            id="btn-verify-all-deadlines"
            type="button"
            onClick={handleVerifyAll}
            disabled={verifyingDeadlines}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              background: '#ffffff',
              color: '#0284c7',
              border: '1px solid #e0f2fe',
              padding: '9px 14px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: verifyingDeadlines ? 'wait' : 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#f0f9ff'
              e.currentTarget.style.borderColor = '#bae6fd'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#ffffff'
              e.currentTarget.style.borderColor = '#e0f2fe'
            }}
            title="Verify deadlines against authoritative sources"
          >
            <ShieldCheck size={15} color="#0284c7" />
            <span>{verifyingDeadlines ? 'Verifying...' : 'Verify Deadlines'}</span>
          </button>

          <button
            id="btn-seed-judge-persona"
            type="button"
            onClick={handleSeedJudgePersona}
            disabled={seedingPersona}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              background: seedSuccess ? '#ecfdf5' : '#ffffff',
              color: seedSuccess ? '#059669' : '#4f46e5',
              border: `1px solid ${seedSuccess ? '#a7f3d0' : '#e0e7ff'}`,
              padding: '9px 14px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: seedingPersona ? 'wait' : 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              if (!seedSuccess) e.currentTarget.style.background = '#eef2ff'
            }}
            onMouseLeave={e => {
              if (!seedSuccess) e.currentTarget.style.background = '#ffffff'
            }}
            title="Load judge demonstration persona with multi-domain tasks & semantic memory"
          >
            <Sparkles size={15} color={seedSuccess ? '#059669' : '#4f46e5'} />
            <span>{seedingPersona ? 'Loading...' : seedSuccess ? 'Persona Loaded!' : 'Demo Persona'}</span>
          </button>

          <button
            id="btn-add-deadline"
            onClick={() => setShowAddModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#ffffff',
              border: 'none',
              padding: '9px 16px',
              borderRadius: '10px',
              fontSize: '13.5px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(37, 99, 235, 0.35)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.25)'
            }}
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {/* Verification Feedback Banner */}
      {verificationSummary && (
        <div
          style={{
            background: verificationSummary.error ? '#fef2f2' : '#f0f9ff',
            border: `1px solid ${verificationSummary.error ? '#fecaca' : '#bae6fd'}`,
            color: verificationSummary.error ? '#991b1b' : '#0369a1',
            padding: '12px 18px',
            borderRadius: '12px',
            marginBottom: '22px',
            fontSize: '13px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldCheck size={18} color={verificationSummary.error ? '#dc2626' : '#0284c7'} />
            <div>
              <span style={{ fontWeight: '700' }}>
                {verificationSummary.error ? 'Verification Alert: ' : 'Verification Complete: '}
              </span>
              <span>
                {verificationSummary.error
                  ? verificationSummary.error
                  : `Checked ${verificationSummary.total} active task(s). ${
                      verificationSummary.drift > 0
                        ? `⚠️ ${verificationSummary.drift} schedule drift(s) detected via live search!`
                        : 'All deadlines confirmed matching authoritative sources.'
                    }`}
              </span>
            </div>
          </div>
          <button
            onClick={() => setVerificationSummary(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Metric Cards Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        {/* Metric 1: Daily Progress */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '18px 20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12.5px', fontWeight: '600', color: '#64748b' }}>Daily Completion</span>
            <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a' }}>{metrics.completed}</span>
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>/ {metrics.total} tasks</span>
          </div>
          {/* Progress Bar */}
          <div style={{ width: '100%', height: '6px', background: '#f1f5f9', borderRadius: '3px', marginTop: '10px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${metrics.progressPct}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                borderRadius: '3px',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', fontWeight: '600' }}>
            {metrics.progressPct}% of goal accomplished
          </div>
        </div>

        {/* Metric 2: Scheduled Focus Time */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '18px 20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12.5px', fontWeight: '600', color: '#64748b' }}>Scheduled Focus</span>
            <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={16} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a' }}>{metrics.focusHours}</span>
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>hours planned</span>
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '12px' }}>
            Distributed across {metrics.open} pending tasks
          </div>
        </div>

        {/* Metric 3: Critical & Impending */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '18px 20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12.5px', fontWeight: '600', color: '#64748b' }}>Critical Deadlines</span>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '7px',
                background: metrics.urgent > 0 ? '#fef2f2' : '#f8fafc',
                color: metrics.urgent > 0 ? '#ef4444' : '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={16} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '24px', fontWeight: '800', color: metrics.urgent > 0 ? '#ef4444' : '#0f172a' }}>
              {metrics.urgent}
            </span>
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>urgent / due soon</span>
          </div>
          <div style={{ fontSize: '11px', color: metrics.overdue > 0 ? '#ef4444' : '#64748b', marginTop: '12px', fontWeight: metrics.overdue > 0 ? '700' : '400' }}>
            {metrics.overdue > 0 ? `⚠️ ${metrics.overdue} task(s) overdue` : 'No overdue items'}
          </div>
        </div>

        {/* Metric 4: Cognitive Workload Guardrail */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '18px 20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12.5px', fontWeight: '600', color: '#64748b' }}>Cognitive Guardrail</span>
            <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: '#f5f3ff', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BrainCircuit size={16} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '20px', fontWeight: '800', color: Number(metrics.focusHours) > 8 ? '#f59e0b' : '#10b981' }}>
              {Number(metrics.focusHours) > 8 ? 'High Workload' : 'Optimal Capacity'}
            </span>
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '12px' }}>
            Burnout & schedule collision protection active
          </div>
        </div>
      </div>

      {/* AI Planning & Copilot Quick Panel */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)',
          borderRadius: '14px',
          padding: '20px 24px',
          marginBottom: '26px',
          color: '#ffffff',
          boxShadow: '0 4px 20px rgba(30, 27, 75, 0.15)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={17} color="#c7d2fe" />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '700', letterSpacing: '-0.2px' }}>
                Compass
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                Powered by NVIDIA Nemotron MoE on Nebius Token Factory
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => onOpenNorthstar && onOpenNorthstar('Propose an optimized conflict-free schedule for today')}
              style={{
                fontSize: '12px',
                fontWeight: '600',
                padding: '6px 12px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#e2e8f0',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.16)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
            >
              🗓️ Auto-Schedule
            </button>
            <button
              onClick={() => onOpenNorthstar && onOpenNorthstar('Detect any cognitive overload or overlapping deadlines')}
              style={{
                fontSize: '12px',
                fontWeight: '600',
                padding: '6px 12px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#e2e8f0',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.16)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
            >
              🧠 Analyze Conflicts
            </button>
          </div>
        </div>

        {/* Quick Prompt Input */}
        <form onSubmit={handleQuickAiSubmit} style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            placeholder="Ask Compass: e.g. 'Break down my next milestone into 3 focused tasks'..."
            value={quickAiPrompt}
            onChange={e => setQuickAiPrompt(e.target.value)}
            style={{
              flex: 1,
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              borderRadius: '10px',
              padding: '10px 14px',
              fontSize: '13.5px',
              color: '#ffffff',
              outline: 'none',
              transition: 'all 0.15s ease',
            }}
            onFocus={e => (e.target.style.borderColor = '#818cf8')}
            onBlur={e => (e.target.style.borderColor = 'rgba(255, 255, 255, 0.18)')}
          />
          <button
            type="submit"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#6366f1',
              border: 'none',
              borderRadius: '10px',
              padding: '0 18px',
              fontSize: '13px',
              fontWeight: '700',
              color: '#ffffff',
              cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(99, 102, 241, 0.4)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#4f46e5')}
            onMouseLeave={e => (e.currentTarget.style.background = '#6366f1')}
          >
            <span>Plan</span>
            <ArrowRight size={14} />
          </button>
        </form>
      </div>

      {/* Onboarding Tour */}
      <OnboardingTour
        onVerifyDeadlines={handleVerifyAll}
        onOpenTelemetry={onOpenTelemetry}
        onOpenNorthstar={onOpenNorthstar}
        onOpenSeed={handleSeedJudgePersona}
      />

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '20px',
          flexWrap: 'wrap',
        }}
      >
        {/* Domain Filter Pills */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {(() => {
            const basePills = ['all', 'hackathon', 'coursework', 'code', 'general', 'other']
            const customPills = tasks
              .map(t => (t.domain || '').toLowerCase().trim())
              .filter(d => d && !basePills.includes(d))
            const uniquePills = Array.from(new Set([...basePills, ...customPills]))

            return uniquePills.map(dom => {
              const pillMeta = dom === 'all' ? { label: 'All Domains' } : getDomainMeta(dom)
              const isSelected = activeDomain === dom
              return (
                <button
                  key={dom}
                  id={`filter-pill-${dom}`}
                  onClick={() => onSelectDomain(dom)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    fontSize: '12.5px',
                    fontWeight: isSelected ? '700' : '500',
                    cursor: 'pointer',
                    border: isSelected ? '1px solid #2563eb' : '1px solid #e2e8f0',
                    background: isSelected ? '#2563eb' : '#ffffff',
                    color: isSelected ? '#ffffff' : '#64748b',
                    boxShadow: isSelected ? '0 2px 6px rgba(37, 99, 235, 0.25)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {pillMeta.label}
                </button>
              )
            })
          })()}
        </div>

        {/* Search & Status Filters */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Status Selector */}
          <div
            style={{
              display: 'flex',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '2px',
            }}
          >
            {[
              { key: 'all', label: 'All' },
              { key: 'open', label: 'Open' },
              { key: 'urgent', label: 'Urgent' },
              { key: 'completed', label: 'Done' },
            ].map(st => (
              <button
                key={st.key}
                onClick={() => setStatusFilter(st.key)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: statusFilter === st.key ? '700' : '500',
                  background: statusFilter === st.key ? '#f1f5f9' : 'transparent',
                  color: statusFilter === st.key ? '#0f172a' : '#64748b',
                  cursor: 'pointer',
                  transition: 'all 0.1s ease',
                }}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '6px 12px',
              width: '210px',
            }}
          >
            <Search size={14} color="#94a3b8" />
            <input
              type="text"
              placeholder="Search tasks & tags..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                border: 'none',
                outline: 'none',
                fontSize: '12.5px',
                color: '#0f172a',
                width: '100%',
                background: 'transparent',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '12px',
                  padding: 0,
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Task Stream Feed */}
      <div className="timeline-feed">
        {filteredTasks.length === 0 ? (
          <div
            style={{
              padding: '48px 20px',
              textAlign: 'center',
              background: '#ffffff',
              borderRadius: '16px',
              border: '1px dashed #cbd5e1',
              color: '#64748b',
              marginTop: '10px',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>📭</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', marginBottom: '6px' }}>
              No tasks found
            </div>
            <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '18px', maxWidth: '420px', margin: '0 auto 18px auto' }}>
              {searchQuery
                ? `No tasks matched your search query "${searchQuery}". Try clearing search or resetting filters.`
                : activeDomain === 'all'
                ? 'Your task queue is completely clear. Add your first goal below or ask Compass to draft one.'
                : `No active tasks found in the ${activeDomain.toUpperCase()} domain.`}
            </div>
            <button
              id="btn-empty-add-deadline"
              onClick={() => setShowAddModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                border: 'none',
                color: '#ffffff',
                padding: '9px 18px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
              }}
            >
              <Plus size={15} />
              <span>Create Task</span>
            </button>
          </div>
        ) : (
          filteredTasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onSelectTask={setSelectedTask}
              onDeleteTask={handleDelete}
              onToggleStatus={handleToggleStatus}
            />
          ))
        )}
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
        onOpenNorthstar={onOpenNorthstar}
      />
    </div>
  )
}
