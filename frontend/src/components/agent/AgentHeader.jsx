import React from 'react'

const SUGGESTED_GOALS = [
  "I have 5 days left and I'm working 4 hours a day. Go through everything I have open across the hackathon, my coursework, and my code debt, and tell me honestly whether I can finish it, and if I can't, decide what I drop.",
  "Plan my week considering all hackathon deadlines and coursework",
  "Flag any deadline conflicts this week and suggest resolutions",
  "Write a retrospective for the Compass project",
  "What are my most urgent tasks across all domains?",
  "Summarize my open tasks and suggest what to tackle first",
]

export default function AgentHeader({
  goal,
  setGoal,
  isRunning,
  onRunAgent,
  onStopAgent,
  proactiveBriefing,
  onLoadProactiveBriefing,
  triggeringNightly,
  onTriggerNightly,
  showHistory,
  setShowHistory,
  runsListCount = 0,
  onFetchRunsHistory,
  steps = [],
  onCopyTrace,
  copyFeedback,
  setRejectFeedback,
}) {
  return (
    <div style={{
      padding: '16px 20px',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
      background: 'var(--bg-card)',
    }}>
      {/* Proactive Autonomous Overnight Briefing Banner */}
      {proactiveBriefing && (
        <div style={{
          background: 'var(--bg-card-soft)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card, 8px)',
          padding: '12px 16px',
          marginBottom: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent, #f5a623)' }}>
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', letterSpacing: '-0.2px' }}>
                Your Morning Briefing is Ready
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Prepared overnight based on your tasks and upcoming deadlines
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              id="load-proactive-briefing-btn"
              onClick={onLoadProactiveBriefing}
              className="btn-primary-amber"
              style={{
                padding: '0 14px',
                minHeight: '36px',
                borderRadius: 'var(--radius-btn, 6px)',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>View Briefing</span>
            </button>
            <button
              id="trigger-nightly-btn"
              onClick={onTriggerNightly}
              disabled={triggeringNightly}
              className="btn-secondary"
              style={{
                padding: '0 12px',
                minHeight: '36px',
                borderRadius: 'var(--radius-btn, 6px)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
              title="Generate an updated briefing right now"
            >
              {triggeringNightly ? 'Updating…' : 'Refresh Now'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <input
          id="agent-goal-input"
          type="text"
          value={goal}
          onChange={e => setGoal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !isRunning && onRunAgent(goal)}
          placeholder="Ask a question or plan your schedule (e.g. 'What are my top priorities today?')"
          disabled={isRunning}
          style={{
            flex: '1 1 200px',
            minHeight: '44px',
            padding: '0 14px',
            background: 'var(--bg-app)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-btn, 6px)',
            color: 'var(--text-primary)',
            fontSize: '13px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {isRunning ? (
          <button
            id="agent-stop-btn"
            onClick={onStopAgent}
            className="btn-secondary"
            style={{
              padding: '0 18px',
              minHeight: '44px',
              background: '#ef4444',
              border: '1px solid #ef4444',
              borderRadius: 'var(--radius-btn, 6px)',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
            <span>Stop</span>
          </button>
        ) : (
          <button
            id="agent-run-btn"
            onClick={() => onRunAgent(goal)}
            disabled={!goal.trim()}
            className="btn-primary-amber"
            style={{
              padding: '0 18px',
              minHeight: '44px',
              borderRadius: 'var(--radius-btn, 6px)',
              fontSize: '13px',
              fontWeight: '600',
              cursor: goal.trim() ? 'pointer' : 'not-allowed',
              opacity: goal.trim() ? 1 : 0.5,
              whiteSpace: 'nowrap',
            }}
          >
            Ask Assistant
          </button>
        )}

        <button
          id="agent-history-toggle-btn"
          onClick={() => { onFetchRunsHistory(); setShowHistory(!showHistory) }}
          className="btn-secondary"
          style={{
            padding: '0 14px',
            minHeight: '44px',
            borderRadius: 'var(--radius-btn, 6px)',
            fontSize: '13px',
            fontWeight: '500',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
          title="View past plans and questions"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
          </svg>
          <span>Past Plans ({runsListCount})</span>
        </button>

        {steps.length > 0 && (
          <button
            id="agent-copy-trace-btn"
            onClick={onCopyTrace}
            className="btn-secondary"
            style={{
              padding: '0 14px',
              minHeight: '44px',
              borderRadius: 'var(--radius-btn, 6px)',
              color: copyFeedback ? 'var(--domain-code, #1c8a62)' : 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Copy this plan to clipboard"
          >
            {copyFeedback ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Copied</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>Copy Plan</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Suggested goals and pre-loaded demo trigger */}
      {steps.length === 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
          <button
            id="agent-demo-reject-btn"
            onClick={() => {
              const demoGoal = "Detect deadline conflicts between hackathon deliverables and coursework and reschedule"
              setGoal(demoGoal)
              setRejectFeedback("Do not move OS Homework 2 deadline")
              onRunAgent(demoGoal)
            }}
            className="btn-secondary"
            style={{
              padding: '0 12px',
              minHeight: '38px',
              borderRadius: 'var(--radius-btn, 6px)',
              color: '#ef4444',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Resolves conflicting deadlines and allows you to guide the plan"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>Resolve Deadline Conflicts</span>
          </button>

          <button
            id="agent-demo-tri-domain-btn"
            onClick={() => {
              const demoGoal = "What should I deprioritize this week, given my code debt and upcoming exams?"
              setGoal(demoGoal)
              onRunAgent(demoGoal)
            }}
            className="btn-secondary"
            style={{
              padding: '0 12px',
              minHeight: '38px',
              borderRadius: 'var(--radius-btn, 6px)',
              color: 'var(--domain-coursework, #2f64c8)',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Balances hackathon, coursework, and code commitments"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>Balance My Workload</span>
          </button>

          <button
            id="agent-demo-abstain-btn"
            onClick={() => {
              const demoGoal = "What is the final grade weighting and curve formula for the Quantum Computing midterm?"
              setGoal(demoGoal)
              onRunAgent(demoGoal)
            }}
            className="btn-secondary"
            style={{
              padding: '0 12px',
              minHeight: '38px',
              borderRadius: 'var(--radius-btn, 6px)',
              color: 'var(--accent, #f5a623)',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Shows how the assistant asks for clarification when info is missing"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Check Missing Info</span>
          </button>

          {SUGGESTED_GOALS.map((sg, i) => (
            <button
              key={i}
              onClick={() => { setGoal(sg); onRunAgent(sg) }}
              className="btn-secondary"
              style={{
                padding: '0 10px',
                minHeight: '38px',
                borderRadius: 'var(--radius-btn, 6px)',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              {sg}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
