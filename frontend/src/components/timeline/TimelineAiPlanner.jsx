import React from 'react'
import {
  Sparkles,
  ArrowRight,
  Calendar,
  Brain,
} from 'lucide-react'

export default function TimelineAiPlanner({
  quickAiPrompt,
  setQuickAiPrompt,
  onQuickAiSubmit,
  onOpenCompass,
}) {
  const handleOpenCompass = onOpenCompass
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-card, 8px)',
        padding: '18px 20px',
        marginBottom: '24px',
        color: 'var(--text-primary)',
        border: '1px solid var(--border)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-btn, 6px)', background: 'rgba(245, 166, 35, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent, #f5a623)' }}>
            <Sparkles size={16} strokeWidth={1.8} />
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '600', letterSpacing: '-0.2px', color: 'var(--text-primary)' }}>
              Compass Assistant
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Powered by NVIDIA Nemotron MoE on Nebius Token Factory
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => handleOpenCompass && handleOpenCompass('Propose an optimized conflict-free schedule for today')}
            className="btn-secondary"
            style={{
              fontSize: '13px',
              fontWeight: '500',
              padding: '0 12px',
              minHeight: '44px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Calendar size={14} strokeWidth={1.8} />
            <span>Auto-Schedule</span>
          </button>
          <button
            type="button"
            onClick={() => handleOpenCompass && handleOpenCompass('Detect any cognitive overload or overlapping deadlines')}
            className="btn-secondary"
            style={{
              fontSize: '13px',
              fontWeight: '500',
              padding: '0 12px',
              minHeight: '44px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Brain size={14} strokeWidth={1.8} />
            <span>Analyze Conflicts</span>
          </button>
        </div>
      </div>

      {/* Quick Prompt Input */}
      <form onSubmit={onQuickAiSubmit} style={{ display: 'flex', gap: '10px' }}>
        <input
          type="text"
          placeholder="Ask Compass: e.g. 'Break down my next milestone into 3 focused tasks'..."
          value={quickAiPrompt}
          onChange={e => setQuickAiPrompt(e.target.value)}
          style={{
            flex: 1,
            background: 'var(--bg-card-soft)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-btn, 6px)',
            padding: '0 14px',
            minHeight: '44px',
            fontSize: '13px',
            color: 'var(--text-primary)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <button
          type="submit"
          className="btn-primary-amber"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            minHeight: '44px',
            padding: '0 18px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          <span>Plan</span>
          <ArrowRight size={14} strokeWidth={1.8} />
        </button>
      </form>
    </div>
  )
}
