import React, { useState } from 'react'
import { BookOpen, Search, Calendar, Brain, Bot, AlertCircle, ClipboardList, Zap } from 'lucide-react'
import { dispatchSpecialist } from '../api/client'
import Logo from './Logo'

const SPECIALISTS = [
  {
    key: 'coursework',
    name: 'Coursework Agent',
    icon: BookOpen,
    color: '#2f64c8',
    bg: 'var(--coursework-bg)',
    border: 'rgba(47, 100, 200, 0.3)',
    desc: 'Academic assignments, lab notes, exams & CS 61C context',
    placeholder: 'Ask about upcoming assignments, CS 61C RISC-V labs, or coursework notes...',
  },
  {
    key: 'research',
    name: 'Research Agent',
    icon: Search,
    color: '#d9890a',
    bg: 'var(--hackathon-bg)',
    border: 'rgba(245, 166, 35, 0.3)',
    desc: 'Real-time web search, hackathon rules & deadline verification',
    placeholder: 'Verify hackathon submission rules, research APIs, or check external deadlines...',
  },
  {
    key: 'calendar',
    name: 'Calendar Agent',
    icon: Calendar,
    color: '#1c8a62',
    bg: 'var(--code-bg)',
    border: 'rgba(28, 138, 98, 0.3)',
    desc: 'Google Calendar sync, free time windows & conflict detection',
    placeholder: 'Find free time slots tomorrow, check calendar conflicts, or schedule focus time...',
  },
  {
    key: 'memory',
    name: 'Memory Agent',
    icon: Brain,
    color: '#7e68b5',
    bg: 'var(--coursework-bg)',
    border: 'rgba(126, 104, 181, 0.3)',
    desc: 'Vector memory (768-dim Matryoshka), code context & task backlog',
    placeholder: 'Search long-term memory, code embeddings, or task history...',
  },
]

export default function SpecialistPanel({ onTaskMutated: _onTaskMutated }) {
  const [selectedSpecialist, setSelectedSpecialist] = useState(null) // null = Auto Dispatcher
  const [goal, setGoal] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleRunSpecialist = async () => {
    if (!goal.trim() || isSubmitting) return

    setIsSubmitting(true)
    setError(null)
    setResult(null)

    try {
      const response = await dispatchSpecialist(goal, selectedSpecialist)
      if (response && response.ok) {
        setResult(response)
      } else {
        setError(response?.error || 'Specialist encountered an error.')
      }
    } catch (err) {
      setError(err.message || 'Specialist agent request failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const activeSpecObj = SPECIALISTS.find(s => s.key === selectedSpecialist)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: '24px', background: 'var(--bg-app)' }}>
      {/* Header Banner */}
      <div style={{ marginBottom: '24px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card, 8px)', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <Bot size={28} color="var(--brand)" strokeWidth={1.8} />
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
              Specialist Multi-Agent System
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
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
            borderRadius: 'var(--radius-card, 8px)',
            cursor: 'pointer',
            background: selectedSpecialist === null ? 'var(--coursework-bg)' : 'var(--bg-card)',
            border: `1px solid ${selectedSpecialist === null ? 'var(--coursework)' : 'var(--border)'}`,
            boxShadow: 'var(--shadow-sm)',
            transition: 'all 0.15s ease',
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Logo size={16} alt="" />
            <span style={{ fontWeight: '700', fontSize: '13px', color: selectedSpecialist === null ? 'var(--coursework-text)' : 'var(--text-primary)' }}>
              Auto Dispatcher
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
            Automatically selects the best specialist based on your prompt.
          </p>
        </div>

        {SPECIALISTS.map(spec => {
          const isSelected = selectedSpecialist === spec.key
          const SpecIcon = spec.icon
          return (
            <div
              key={spec.key}
              onClick={() => setSelectedSpecialist(spec.key)}
              style={{
                padding: '14px',
                borderRadius: 'var(--radius-card, 8px)',
                cursor: 'pointer',
                background: isSelected ? spec.bg : 'var(--bg-card)',
                border: `1px solid ${isSelected ? spec.color : 'var(--border)'}`,
                boxShadow: 'var(--shadow-sm)',
                transition: 'all 0.15s ease',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <SpecIcon size={16} strokeWidth={1.8} color={isSelected ? spec.color : 'var(--text-secondary)'} />
                <span style={{ fontWeight: '700', fontSize: '13px', color: isSelected ? spec.color : 'var(--text-primary)' }}>
                  {spec.name}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                {spec.desc}
              </p>
            </div>
          )
        })}
      </div>

      {/* Query Form */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card, 8px)', padding: '16px', marginBottom: '20px', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ fontSize: '12px', fontWeight: '700', color: activeSpecObj ? activeSpecObj.color : 'var(--brand-dark)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {activeSpecObj ? (
            <activeSpecObj.icon size={15} strokeWidth={1.8} color={activeSpecObj.color} />
          ) : (
            <Zap size={15} strokeWidth={1.8} color="var(--brand)" />
          )}
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
              borderRadius: 'var(--radius-input, 6px)',
              background: 'var(--bg-app)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: '13.5px',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={isSubmitting || !goal.trim()}
            style={{
              padding: '0 20px',
              borderRadius: 'var(--radius-btn, 6px)',
              background: activeSpecObj ? activeSpecObj.color : 'var(--brand)',
              border: 'none',
              color: '#ffffff',
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
        <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-card, 8px)', background: 'var(--danger-bg)', border: '1px solid #ef4444', color: '#b91c1c', fontSize: '13px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={15} strokeWidth={1.8} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Results View */}
      {result && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card, 8px)', padding: '20px', boxShadow: 'var(--shadow-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {(() => {
                const matched = SPECIALISTS.find(s => s.key === result.capability)
                if (matched) {
                  const MatchedIcon = matched.icon
                  return <MatchedIcon size={18} strokeWidth={1.8} color={matched.color} />
                }
                return <Zap size={18} strokeWidth={1.8} color="var(--brand)" />
              })()}
              <span style={{ fontSize: '14px', fontWeight: '700', color: SPECIALISTS.find(s => s.key === result.capability)?.color || 'var(--text-primary)', textTransform: 'capitalize' }}>
                {result.capability} Specialist Analysis
              </span>
            </div>
            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: 'var(--radius-btn, 6px)', background: 'var(--code-bg)', color: 'var(--code-text)', border: '1px solid rgba(20, 184, 132, 0.3)', fontFamily: 'JetBrains Mono, monospace', fontWeight: '700' }}>
              {result.status.toUpperCase()}
            </span>
          </div>

          {/* Summary Box */}
          <div style={{ fontSize: '13.5px', color: 'var(--text-primary)', lineHeight: '1.6', whiteSpace: 'pre-wrap', marginBottom: '16px' }}>
            {result.summary}
          </div>

          {/* Proposed Actions Notice (if any) */}
          {result.proposed_actions && result.proposed_actions.length > 0 && (
            <div style={{ background: 'var(--hackathon-bg)', border: '1px solid rgba(245, 166, 35, 0.4)', borderRadius: 'var(--radius-card, 8px)', padding: '12px 14px', fontSize: '12px', color: 'var(--hackathon-text)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ClipboardList size={14} strokeWidth={1.8} />
                <strong style={{ color: 'var(--hackathon-text)' }}>Proposed Mutating Actions:</strong>
              </div>
              <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-primary)', fontFamily: 'JetBrains Mono, monospace' }}>
                Specialist returned {result.proposed_actions.length} proposed action(s). These are passed back to Northstar for confirmation gate approval before execution.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
