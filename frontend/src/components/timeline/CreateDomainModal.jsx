import React, { useState, useEffect, useRef } from 'react'
import { normalizeDomainKey, saveCustomDomain, getCustomDomains } from './domainMeta'

const PRESET_ICONS = [
  '🎯', '🧠', '📝', '🔬', '⚡', '🎨', '🛠️', '💼',
  '📊', '💡', '🏃', '🌿', '🚀', '📚', '💻', '🌐'
]

const PALETTE_COLORS = [
  '#f472b6', '#38bdf8', '#a78bfa', '#fb923c',
  '#34d399', '#fbbf24', '#e879f9', '#94a3b8'
]

export default function CreateDomainModal({
  isOpen,
  onClose,
  onCreated,
  existingDomains = [],
}) {
  const [name, setName] = useState('')
  const [selectedIcon, setSelectedIcon] = useState('🎯')
  const [selectedColor, setSelectedColor] = useState('#f472b6')
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setName('')
      setSelectedIcon('🎯')
      setSelectedColor('#f472b6')
      setError(null)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = (e) => {
    if (e) e.preventDefault()
    setError(null)

    const trimmed = name.trim()
    if (!trimmed) {
      setError('Give your domain a name first.')
      return
    }

    if (trimmed.length > 32) {
      setError('Domain names must be 32 characters or fewer.')
      return
    }

    const key = normalizeDomainKey(trimmed)
    if (!key) {
      setError('Give your domain a valid name using letters or numbers.')
      return
    }

    // Check against existing domains (both base and custom)
    const allExistingKeys = new Set([
      'hackathon', 'coursework', 'code', 'general', 'other',
      ...existingDomains.map(d => (typeof d === 'string' ? d : d.key).toLowerCase().trim()),
      ...getCustomDomains().map(d => d.key.toLowerCase().trim()),
    ])

    if (allExistingKeys.has(key)) {
      setError('That domain already exists.')
      return
    }

    const newDomain = {
      key,
      label: trimmed,
      icon: selectedIcon,
      color: selectedColor,
      border: `${selectedColor}66`,
    }

    // Persist to localStorage
    saveCustomDomain(newDomain)

    if (onCreated) {
      onCreated(newDomain)
    }
    onClose()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-domain-title"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 18, 30, 0.65)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          width: '100%',
          maxWidth: '420px',
          padding: '24px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.45)',
          color: 'var(--text-primary)',
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
          <div>
            <h3
              id="create-domain-title"
              style={{
                fontSize: '17px',
                fontWeight: '700',
                color: 'var(--text-primary)',
                margin: 0,
                letterSpacing: '-0.2px',
              }}
            >
              Create a domain
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              Keep related work together.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '15px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            ✕
          </button>
        </div>

        {/* Error notification */}
        {error && (
          <div
            role="alert"
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              padding: '9px 13px',
              borderRadius: '8px',
              fontSize: '12.5px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Domain Name */}
          <div>
            <label
              htmlFor="input-domain-name"
              style={{
                display: 'block',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-secondary)',
                fontWeight: '700',
                marginBottom: '6px',
              }}
            >
              Name
            </label>
            <input
              id="input-domain-name"
              ref={inputRef}
              type="text"
              required
              maxLength={32}
              placeholder="e.g. Personal Projects"
              value={name}
              onChange={e => {
                setName(e.target.value)
                if (error) setError(null)
              }}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-app)',
                color: 'var(--text-primary)',
                fontSize: '13.5px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={e => e.currentTarget.style.borderColor = 'var(--brand)'}
              onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
            />
          </div>

          {/* Icon Picker */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-secondary)',
                fontWeight: '700',
                marginBottom: '8px',
              }}
            >
              Icon
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(8, 1fr)',
                gap: '6px',
              }}
            >
              {PRESET_ICONS.map(icon => {
                const isSelected = selectedIcon === icon
                return (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setSelectedIcon(icon)}
                    title={`Select ${icon}`}
                    aria-label={`Select icon ${icon}`}
                    style={{
                      height: '36px',
                      borderRadius: '8px',
                      border: isSelected ? '1.5px solid var(--brand)' : '1px solid var(--border)',
                      background: isSelected ? 'rgba(245, 166, 35, 0.12)' : 'var(--bg-app)',
                      fontSize: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      padding: 0,
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) e.currentTarget.style.borderColor = 'var(--border)'
                    }}
                  >
                    {icon}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Color Accent Picker */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-secondary)',
                fontWeight: '700',
                marginBottom: '8px',
              }}
            >
              Accent Color
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {PALETTE_COLORS.map(c => {
                const isSelected = selectedColor === c
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedColor(c)}
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: c,
                      border: isSelected ? '2px solid #ffffff' : '2px solid transparent',
                      boxShadow: isSelected ? '0 0 6px rgba(255,255,255,0.4)' : 'none',
                      cursor: 'pointer',
                      padding: 0,
                      transition: 'all 0.15s ease',
                    }}
                  />
                )
              })}
            </div>
          </div>

          {/* Action buttons */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '10px',
              paddingTop: '12px',
              borderTop: '1px solid var(--border)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--text-primary)'
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--text-secondary)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              Cancel
            </button>
            <button
              id="btn-confirm-create-domain"
              type="submit"
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--brand)',
                color: '#2a1a00',
                fontSize: '13px',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              Create Domain
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
