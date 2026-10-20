import React, { useState } from 'react'
import Logo from './Logo'

export default function OnboardingTour({
  onVerifyDeadlines,
  onOpenTelemetry,
  onOpenCompass,
  onOpenSeed: _onOpenSeed,
}) {
  const handleOpenCompass = onOpenCompass
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('compass_tour_dismissed') === '1'
    } catch {
      return false
    }
  })
  const [isCollapsed, setIsCollapsed] = useState(false)

  const handleDismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem('compass_tour_dismissed', '1')
    } catch {
      /* ignore storage access error */
    }
  }

  const handleReopen = () => {
    setDismissed(false)
    setIsCollapsed(false)
    try {
      localStorage.removeItem('compass_tour_dismissed')
    } catch {
      /* ignore storage access error */
    }
  }

  if (dismissed) {
    return (
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          id="btn-reopen-tour"
          onClick={handleReopen}
          className="btn-secondary"
          style={{
            fontSize: '13px',
            fontWeight: '500',
            padding: '0 14px',
            minHeight: '44px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
          title="Re-open Hackathon Judge Tour"
        >
          <Logo size={15} alt="Compass logo" />
          <span>Judge Guide & Architecture</span>
        </button>
      </div>
    )
  }

  return (
    <div
      id="judge-onboarding-tour"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card, 8px)',
        padding: isCollapsed ? '12px 18px' : '20px 22px',
        marginBottom: '22px',
        position: 'relative',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Logo size={20} alt="" />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', letterSpacing: '-0.2px' }}>
                Compass Architecture & Evaluation Guide
              </span>
              <span style={{
                fontSize: '11px',
                fontWeight: '600',
                background: 'rgba(245, 166, 35, 0.12)',
                color: 'var(--text-primary)',
                border: '1px solid rgba(245, 166, 35, 0.25)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-btn, 6px)',
                letterSpacing: '0.03em',
              }}>
                Nebius x NVIDIA
              </span>
            </div>
            {!isCollapsed && (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                Persistent multi-domain copilot combining 3-tier Nemotron MoE, Tavily schedule drift detection, and pgvector HNSW memory.
              </p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '13px',
              padding: '6px 10px',
              borderRadius: 'var(--radius-btn, 6px)',
            }}
            title={isCollapsed ? 'Expand Guide' : 'Collapse Guide'}
          >
            {isCollapsed ? '▼ Expand' : '▲ Minimize'}
          </button>
          <button
            onClick={handleDismiss}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '13px',
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-btn, 6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
            title="Dismiss Guide"
          >
            ✕
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* 4 Feature Pillars Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: '12px',
            marginTop: '16px',
            marginBottom: '16px',
          }}>
            {/* Pillar 1: NVIDIA Architecture */}
            <div style={{
              background: 'var(--bg-card-soft)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card, 8px)',
              padding: '14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent, #f5a623)' }}>
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                  3-Tier NVIDIA MoE
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.45', margin: 0 }}>
                <strong style={{ color: 'var(--text-primary)', fontWeight: '600' }}>Nemotron-3 Nano</strong> (30B, intent routing) → <strong style={{ color: 'var(--text-primary)', fontWeight: '600' }}>Super</strong> (120B, ReAct planning) → <strong style={{ color: 'var(--text-primary)', fontWeight: '600' }}>Ultra</strong> (550B, cross-domain synthesis) on Nebius Token Factory.
              </p>
            </div>

            {/* Pillar 2: Tavily Drift Detection */}
            <div style={{
              background: 'var(--bg-card-soft)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card, 8px)',
              padding: '14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--domain-coursework, #2f64c8)' }}>
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                  Tavily Live Web Drift
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.45', margin: 0 }}>
                Proactively scrapes official hackathon and coursework portals using Tavily to detect schedule postponements and warn before deadlines slip.
              </p>
            </div>

            {/* Pillar 3: Matryoshka Vector Memory */}
            <div style={{
              background: 'var(--bg-card-soft)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card, 8px)',
              padding: '14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--domain-code, #1c8a62)' }}>
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                  <rect x="9" y="9" width="6" height="6" />
                  <line x1="9" y1="1" x2="9" y2="4" />
                  <line x1="15" y1="1" x2="15" y2="4" />
                  <line x1="9" y1="20" x2="9" y2="23" />
                  <line x1="15" y1="20" x2="15" y2="23" />
                </svg>
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                  Domain-Isolated Recall
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.45', margin: 0 }}>
                Neon pgvector HNSW with <strong style={{ color: 'var(--text-primary)', fontWeight: '600' }}>768-dim Matryoshka</strong> embeddings. Keeps hackathon, coursework, and code contexts strictly isolated.
              </p>
            </div>

            {/* Pillar 4: Feasibility & Safety */}
            <div style={{
              background: 'var(--bg-card-soft)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card, 8px)',
              padding: '14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--domain-general, #6b7a86)' }}>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                  Feasibility & Trust
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.45', margin: 0 }}>
                Mathematical capacity load calculations flag impossible schedules; epistemic abstention says <em>"I don't know"</em> instead of hallucinating.
              </p>
            </div>
          </div>

          {/* Quick Action Test Buttons */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            borderTop: '1px solid var(--border-soft, var(--border))',
            paddingTop: '14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '600', letterSpacing: '0.02em' }}>
                Try 1-Click Tests:
              </span>

              {onVerifyDeadlines && (
                <button
                  id="btn-tour-verify-tavily"
                  onClick={onVerifyDeadlines}
                  className="btn-secondary"
                  style={{
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    minHeight: '44px',
                    padding: '0 12px',
                  }}
                  title="Run proactive Tavily web search against tasks to detect schedule drift"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <span>Test Tavily Verification</span>
                </button>
              )}

              {onOpenTelemetry && (
                <button
                  id="btn-tour-open-telemetry"
                  onClick={onOpenTelemetry}
                  className="btn-secondary"
                  style={{
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    minHeight: '44px',
                    padding: '0 12px',
                  }}
                  title="Open live token accounting and GPU inference breakdown"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent, #f5a623)' }}>
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  <span>Inspect Nebius Telemetry</span>
                </button>
              )}

              {handleOpenCompass && (
                <button
                  id="btn-tour-open-compass"
                  onClick={() => handleOpenCompass("Synthesize a realistic cross-domain roadmap for this weekend")}
                  className="btn-secondary"
                  style={{
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    minHeight: '44px',
                    padding: '0 12px',
                  }}
                  title="Test Nemotron Ultra cross-domain roadmap synthesis"
                >
                  <Logo size={14} alt="" />
                  <span>Compass</span>
                </button>
              )}
            </div>

            <button
              onClick={handleDismiss}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '6px 8px',
              }}
            >
              Don't show this again
            </button>
          </div>
        </>
      )}
    </div>
  )
}
