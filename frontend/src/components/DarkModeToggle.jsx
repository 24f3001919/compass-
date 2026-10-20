import React, { useState } from 'react'

export default function DarkModeToggle({
  isDarkMode,
  onToggleDarkMode,
  id = 'header-theme-toggle',
}) {
  const [isHovered, setIsHovered] = useState(false)

  if (!onToggleDarkMode) return null

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={isDarkMode}
      aria-label={`Switch to ${isDarkMode ? 'Light' : 'Dark'} Mode`}
      title={`Switch to ${isDarkMode ? 'Light' : 'Dark'} Mode`}
      onClick={() => onToggleDarkMode()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isHovered ? 'var(--bg-card-soft)' : 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        cursor: 'pointer',
        width: '44px',
        height: '44px',
        minWidth: '44px',
        minHeight: '44px',
        padding: 0,
        color: 'var(--text-primary)',
        transition: 'background-color 0.15s ease, border-color 0.15s ease',
        flexShrink: 0,
      }}
    >
      {isDarkMode ? (
        /* Sun line icon: 1.8 stroke, currentColor */
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>
      ) : (
        /* Moon line icon: 1.8 stroke, currentColor */
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      )}
    </button>
  )
}
