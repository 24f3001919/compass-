import React, { useState } from 'react'
import { dispatchSpecialist } from '../api/client'

const SPECIALISTS = [
  {
    key: 'coursework',
    name: 'Coursework Agent',
    icon: '📚',
    color: '#60a5fa',
    bg: 'rgba(96, 165, 250, 0.1)',
    border: 'rgba(96, 165, 250, 0.3)',
    desc: 'Academic assignments, lab notes, exams & CS 61C context',
    placeholder: 'Ask about upcoming assignments, CS 61C RISC-V labs, or coursework notes...',
  },
  {
    key: 'research',
    name: 'Research Agent',
    icon: '🔎',
    color: '#fbbf24',
    bg: 'rgba(251, 191, 36, 0.1)',
    border: 'rgba(251, 191, 36, 0.3)',
    desc: 'Real-time web search, hackathon rules & deadline verification',
    placeholder: 'Verify hackathon submission rules, research APIs, or check external deadlines...',
  },
  {
    key: 'calendar',
    name: 'Calendar Agent',
    icon: '📅',
    color: '#34d399',
    bg: 'rgba(52, 211, 153, 0.1)',
    border: 'rgba(52, 211, 153, 0.3)',
    desc: 'Google Calendar sync, free time windows & conflict detection',
    placeholder: 'Find free time slots tomorrow, check calendar conflicts, or schedule focus time...',
  },
  {
    key: 'memory',
    name: 'Memory Agent',
    icon: '🧠',
    color: '#c084fc',
    bg: 'rgba(192, 132, 252, 0.1)',
    border: 'rgba(192, 132, 252, 0.3)',
    desc: 'Vector memory (768-dim Matryoshka), code context & task backlog',
    placeholder: 'Search long-term memory, code embeddings, or task history...',
  },
]

export default function SpecialistPanel({ onTaskMutated }) {
  const [selectedSpecialist, setSelectedSpecialist] = useState(null) // null = Auto Dispatcher
  const [goal, setGoal] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleRunSpecialist = async (targetDomain, customGoal) => {
    const inputGoal = (customGoal || goal).trim()
    if (!inputGoal || isSubmitting) return

    setIsSubmitting(true)
    setError(null)
    setResult(null)

    // Domain inference if auto dispatcher is selected
    let capability = targetDomain || selectedSpecialist
    if (!capability) {
      const lower = inputGoal.toLowerCase()
      if (lower.includes('course') || lower.includes('hw') || lower.includes('lab') || lower.includes('exam') || lower.includes('assignment')) {
        capability = 'coursework'
      } else if (lower.includes('research') || lower.includes('search') || lower.includes('rule') || lower.includes('web') || lower.includes('deadline')) {
        capability = 'research'
      } else if (lower.includes('calendar') || lower.includes('schedule') || lower.includes('free time') || lower.includes('slot') || lower.includes('meet')) {
        capability = 'calendar'
      } else {
        capability = 'memory'
      }
    }

    try {
      const res = await dispatchSpecialist({
        capability,
        user_goal: inputGoal,
      })
      setResult(res)
    } catch (err) {
      setError(err.message || 'Specialist agent request failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const activeSpecObj = SPECIALISTS.find(s => s.key === selectedSpecialist)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', overflowY: 'auto', padding: '24px', background: '#0b0f17' }}>
      {/* Header Banner */}
      <div style={{ marginBottom: '24px', background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6), rgba(15, 23, 42, 0.8))', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <span style={{ fontSize: '28px' }}>🧠</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#f8fafc', letterSpacing: '-0.3px' }}>
              Specialist Multi-Agent System
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#94a3b8' }}>
              Direct access to Compass's domain-specialized AI team. Pure read-only analysis & structured findings.
            </p>
          </div>
        </div>
      </div>

      {/* Specialist Selector Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div
          onClick={() => setSelectedSpecialist(null)}
          style={{
            padding: '14px',
            borderRadius: '10px',
            cursor: 'pointer',
            background: selectedSpecialist === null ? 'rgba(99, 102, 241, 0.15)' : '#111827',
            border: `1px solid ${selectedSpecialist === null ? '#6366f1' : '#1f2937'}`,
            transition: 'all 0.15s ease',
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '16px' }}>🧭</span>
            <span style={{ fontWeight: '700', fontSize: '13px', color: selectedSpecialist === null ? '#818cf8' : '#e2e8f0' }}>
              Auto Dispatcher
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', lineHeight: '1.4' }}>
            Automatically selects the best specialist based on your prompt.
          </p>
        </div>

        {SPECIALISTS.map(spec => {
          const isSelected = selectedSpecialist === spec.key
          return (
            <div
              key={spec.key}
              onClick={() => setSelectedSpecialist(spec.key)}
              style={{
                padding: '14px',
                borderRadius: '10px',
                cursor: 'pointer',
                background: isSelected ? spec.bg : '#111827',
                border: `1px solid ${isSelected ? spec.color : '#1f2937'}`,
                transition: 'all 0.15s ease',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '16px' }}>{spec.icon}</span>
                <span style={{ fontWeight: '700', fontSize: '13px', color: isSelected ? spec.color : '#e2e8f0' }}>
                  {spec.name}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', lineHeight: '1.4' }}>
                {spec.desc}
              </p>
            </div>
          )
        })}
      </div>

      {/* Query Form */}
      <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
        <div style={{ fontSize: '12px', fontWeight: '700', color: activeSpecObj ? activeSpecObj.color : '#818cf8', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>{activeSpecObj ? activeSpecObj.icon : '⚡'}</span>
          <span>Targeting: {activeSpecObj ? activeSpecObj.name : 'Auto-routed Specialist Dispatcher'}</span>
        </div>

        <form onSubmit={e => { e.preventDefault(); handleRunSpecialist() }} style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder={activeSpecObj ? activeSpecObj.placeholder : 'Ask the specialist team anything...'}
            disabled={isSubmitting}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: '8px',
              background: '#0b0f17',
              border: '1px solid #374151',
              color: '#fff',
              fontSize: '13.5px',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={isSubmitting || !goal.trim()}
            style={{
              padding: '0 20px',
              borderRadius: '8px',
              background: activeSpecObj ? activeSpecObj.color : '#6366f1',
              border: 'none',
              color: '#0b0f17',
              fontWeight: '700',
              fontSize: '13px',
              cursor: (isSubmitting || !goal.trim()) ? 'not-allowed' : 'pointer',
              opacity: (isSubmitting || !goal.trim()) ? 0.5 : 1,
            }}>
            {isSubmitting ? 'Analyzing...' : 'Run Specialist'}
          </button>
        </form>
      </div>

      {/* Error state */}
      {error && (
        <div style={{ padding: '14px 16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#f87171', fontSize: '13px', marginBottom: '20px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Results View */}
      {result && (
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid #1f2937', paddingBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>
                {SPECIALISTS.find(s => s.key === result.capability)?.icon || '⚡'}
              </span>
              <span style={{ fontSize: '14px', fontWeight: '700', color: SPECIALISTS.find(s => s.key === result.capability)?.color || '#60a5fa', textTransform: 'capitalize' }}>
                {result.capability} Specialist Analysis
              </span>
            </div>
            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)', fontFamily: 'JetBrains Mono, monospace' }}>
              {result.status.toUpperCase()}
            </span>
          </div>

          {/* Summary Box */}
          <div style={{ fontSize: '13.5px', color: '#f1f5f9', lineHeight: '1.6', whiteSpace: 'pre-wrap', marginBottom: '16px' }}>
            {result.summary}
          </div>

          {/* Proposed Actions Notice (if any) */}
          {result.proposed_actions && result.proposed_actions.length > 0 && (
            <div style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)', borderRadius: '8px', padding: '12px 14px', fontSize: '12px', color: '#fbbf24' }}>
              <strong style={{ color: '#fbbf24' }}>📋 Proposed Mutating Actions:</strong>
              <div style={{ marginTop: '4px', fontSize: '11px', color: '#e2e8f0', fontFamily: 'JetBrains Mono, monospace' }}>
                Specialist returned {result.proposed_actions.length} proposed action(s). These are passed back to Northstar for confirmation gate approval before execution.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
