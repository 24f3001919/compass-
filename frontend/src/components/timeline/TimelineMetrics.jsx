import React from 'react'
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  BrainCircuit,
} from 'lucide-react'

export default function TimelineMetrics({ metrics }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '14px',
        marginBottom: '22px',
      }}
    >
      {/* Metric 1: Daily Progress */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card, 8px)',
          padding: '16px 18px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Daily Completion</span>
          <div style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-btn, 6px)', background: 'rgba(28, 138, 98, 0.1)', color: 'var(--domain-code, #1c8a62)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={16} strokeWidth={1.8} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)' }}>{metrics.completed}</span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>/ {metrics.total} tasks</span>
        </div>
        {/* Progress Bar */}
        <div style={{ width: '100%', height: '6px', background: 'var(--bg-card-soft)', borderRadius: '3px', marginTop: '10px', overflow: 'hidden' }}>
          <div
            style={{
              width: `${metrics.progressPct}%`,
              height: '100%',
              background: 'var(--domain-code, #1c8a62)',
              borderRadius: '3px',
              transition: 'width 0.4s ease',
            }}
          />
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px', fontWeight: '500' }}>
          {metrics.progressPct}% of goal accomplished
        </div>
      </div>

      {/* Metric 2: Scheduled Focus Time */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card, 8px)',
          padding: '16px 18px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Scheduled Focus</span>
          <div style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-btn, 6px)', background: 'rgba(47, 100, 200, 0.1)', color: 'var(--domain-coursework, #2f64c8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={16} strokeWidth={1.8} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text-primary)' }}>{metrics.focusHours}</span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>hours planned</span>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '12px' }}>
          Distributed across {metrics.open} pending tasks
        </div>
      </div>

      {/* Metric 3: Critical & Impending */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card, 8px)',
          padding: '16px 18px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Critical Deadlines</span>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: 'var(--radius-btn, 6px)',
              background: metrics.urgent > 0 ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-card-soft)',
              color: metrics.urgent > 0 ? '#ef4444' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertTriangle size={16} strokeWidth={1.8} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ fontSize: '24px', fontWeight: '600', color: metrics.urgent > 0 ? '#ef4444' : 'var(--text-primary)' }}>
            {metrics.urgent}
          </span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>urgent / due soon</span>
        </div>
        <div style={{ fontSize: '12px', color: metrics.overdue > 0 ? '#ef4444' : 'var(--text-secondary)', marginTop: '12px', fontWeight: metrics.overdue > 0 ? '600' : '400' }}>
          {metrics.overdue > 0 ? `${metrics.overdue} task(s) overdue` : 'No overdue items'}
        </div>
      </div>

      {/* Metric 4: Cognitive Workload Guardrail */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card, 8px)',
          padding: '16px 18px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>Cognitive Guardrail</span>
          <div style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-btn, 6px)', background: 'rgba(245, 166, 35, 0.1)', color: 'var(--accent, #f5a623)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BrainCircuit size={16} strokeWidth={1.8} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ fontSize: '18px', fontWeight: '600', color: Number(metrics.focusHours) > 8 ? 'var(--accent, #f5a623)' : 'var(--domain-code, #1c8a62)' }}>
            {Number(metrics.focusHours) > 8 ? 'High Workload' : 'Optimal Capacity'}
          </span>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '12px' }}>
          Burnout & schedule collision protection active
        </div>
      </div>
    </div>
  )
}
