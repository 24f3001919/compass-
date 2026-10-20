import React from 'react'
import Logo from './Logo'

/**
 * MobileNavBar
 * Fixed bottom navigation bar for mobile viewports (< 768px).
 * Provides one-tap access to primary destinations with clean line icons (1.8 stroke, currentColor).
 */
export default function MobileNavBar({
  activeTab,
  onSelectTab,
  onOpenMenu,
  _activeDomain = 'all',
}) {
  const isDashboardActive = activeTab === 'dashboard'
  const isTimelineActive = activeTab === 'timeline'
  const isCompassActive = activeTab === 'compass' || activeTab === 'assistant' || activeTab === 'planner' || activeTab === 'agent'
  const isCalendarActive = activeTab === 'calendar'
  const isCareerActive = activeTab === 'career' || activeTab === 'radar'

  return (
    <nav
      id="mobile-bottom-nav"
      className="mobile-nav-bar"
      aria-label="Mobile Navigation"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '58px',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        background: 'var(--bg-card)',
        borderTop: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
        zIndex: 850,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'space-around',
        boxSizing: 'content-box',
        userSelect: 'none',
      }}
    >
      {/* 1. Dashboard */}
      <button
        id="mobile-tab-dashboard"
        type="button"
        onClick={() => onSelectTab('dashboard')}
        className={`mobile-nav-item ${isDashboardActive ? 'active' : ''}`}
        aria-label="Dashboard overview"
        aria-current={isDashboardActive ? 'page' : undefined}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '6px 0',
          gap: '3px',
          color: isDashboardActive ? 'var(--text-primary)' : 'var(--text-muted)',
          transition: 'color 0.15s ease',
          minHeight: '48px',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '24px',
            borderRadius: '6px',
            background: isDashboardActive ? 'var(--bg-card-soft)' : 'transparent',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect width="7" height="9" x="3" y="3" rx="1" />
            <rect width="7" height="5" x="14" y="3" rx="1" />
            <rect width="7" height="9" x="14" y="12" rx="1" />
            <rect width="7" height="5" x="3" y="16" rx="1" />
          </svg>
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: isDashboardActive ? '600' : '500',
            letterSpacing: '0.01em',
          }}
        >
          Dashboard
        </span>
      </button>

      {/* 2. Timeline */}
      <button
        id="mobile-tab-timeline"
        type="button"
        onClick={() => onSelectTab('timeline')}
        className={`mobile-nav-item ${isTimelineActive ? 'active' : ''}`}
        aria-label="Timeline feed and tasks"
        aria-current={isTimelineActive ? 'page' : undefined}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '6px 0',
          gap: '3px',
          color: isTimelineActive ? 'var(--text-primary)' : 'var(--text-muted)',
          transition: 'color 0.15s ease',
          minHeight: '48px',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '24px',
            borderRadius: '6px',
            background: isTimelineActive ? 'var(--bg-card-soft)' : 'transparent',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 3v18" />
            <path d="M18 3v18" />
            <rect width="6" height="7" x="3" y="5" rx="1" />
            <rect width="6" height="5" x="15" y="5" rx="1" />
            <rect width="6" height="7" x="15" y="14" rx="1" />
          </svg>
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: isTimelineActive ? '600' : '500',
            letterSpacing: '0.01em',
          }}
        >
          Timeline
        </span>
      </button>

      {/* 3. Compass Assistant */}
      <button
        id="mobile-tab-compass"
        type="button"
        onClick={() => onSelectTab('compass')}
        className={`mobile-nav-item ${isCompassActive ? 'active' : ''}`}
        aria-label="Compass AI Assistant"
        aria-current={isCompassActive ? 'page' : undefined}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '6px 0',
          gap: '3px',
          color: isCompassActive ? 'var(--text-primary)' : 'var(--text-muted)',
          transition: 'color 0.15s ease',
          minHeight: '48px',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '24px',
            borderRadius: '6px',
            background: isCompassActive ? 'var(--bg-card-soft)' : 'transparent',
          }}
        >
          <Logo size={18} alt="" />
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: isCompassActive ? '600' : '500',
            letterSpacing: '0.01em',
          }}
        >
          Compass
        </span>
      </button>

      {/* 4. Schedule / Calendar */}
      <button
        id="mobile-tab-calendar"
        type="button"
        onClick={() => onSelectTab('calendar')}
        className={`mobile-nav-item ${isCalendarActive ? 'active' : ''}`}
        aria-label="Schedule and calendar"
        aria-current={isCalendarActive ? 'page' : undefined}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '6px 0',
          gap: '3px',
          color: isCalendarActive ? 'var(--text-primary)' : 'var(--text-muted)',
          transition: 'color 0.15s ease',
          minHeight: '48px',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '24px',
            borderRadius: '6px',
            background: isCalendarActive ? 'var(--bg-card-soft)' : 'transparent',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect width="18" height="18" x="3" y="4" rx="2" />
            <path d="M3 10h18" />
            <path d="M8 2v4" />
            <path d="M16 2v4" />
          </svg>
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: isCalendarActive ? '600' : '500',
            letterSpacing: '0.01em',
          }}
        >
          Schedule
        </span>
      </button>

      {/* 5. Career Copilot */}
      <button
        id="mobile-tab-career"
        type="button"
        onClick={() => onSelectTab('career')}
        className={`mobile-nav-item ${isCareerActive ? 'active' : ''}`}
        aria-label="Career Copilot"
        aria-current={isCareerActive ? 'page' : undefined}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '6px 0',
          gap: '3px',
          color: isCareerActive ? 'var(--text-primary)' : 'var(--text-muted)',
          transition: 'color 0.15s ease',
          minHeight: '48px',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '24px',
            borderRadius: '6px',
            background: isCareerActive ? 'var(--bg-card-soft)' : 'transparent',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" />
          </svg>
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: isCareerActive ? '600' : '500',
            letterSpacing: '0.01em',
          }}
        >
          Career
        </span>
      </button>

      {/* 6. More (Domains, Account, Telemetry) */}
      <button
        id="mobile-tab-more"
        type="button"
        onClick={onOpenMenu}
        className="mobile-nav-item"
        aria-label="More options, domains and workspace settings"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '6px 0',
          gap: '3px',
          color: 'var(--text-muted)',
          transition: 'color 0.15s ease',
          minHeight: '48px',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '24px',
            borderRadius: '6px',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="4" x2="20" y1="12" y2="12" />
            <line x1="4" x2="20" y1="6" y2="6" />
            <line x1="4" x2="20" y1="18" y2="18" />
          </svg>
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: '500',
            letterSpacing: '0.01em',
          }}
        >
          More
        </span>
      </button>
    </nav>
  )
}
