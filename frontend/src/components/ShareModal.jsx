import React, { useState } from 'react'
import { Link2, X, Check, Copy, ExternalLink } from 'lucide-react'

export default function ShareModal({ isOpen, onClose, conversation }) {
  const [copied, setCopied] = useState(false)

  if (!isOpen || !conversation) return null

  const shareUrl = `${window.location.origin}/?share=${conversation.id}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback
      const input = document.getElementById('share-link-input')
      if (input) {
        input.select()
        document.execCommand('copy')
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      }
    }
  }

  const handleOpenLink = () => {
    window.open(shareUrl, '_blank')
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(27, 26, 23, 0.45)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card, 8px)',
          padding: '24px',
          maxWidth: '460px',
          width: '100%',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: 'var(--radius-btn, 6px)',
              background: 'var(--bg-card-soft)', border: '1px solid var(--border)',
              color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Link2 size={18} strokeWidth={1.8} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', letterSpacing: '-0.2px' }}>
                Share link to chat
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                Anyone with this link will be able to view this chat.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="btn-touch-target btn-secondary"
            style={{
              color: 'var(--text-muted)',
              cursor: 'pointer',
              width: '32px',
              height: '32px',
              minHeight: '32px',
              borderRadius: 'var(--radius-btn, 6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Close"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>

        {/* Chat Preview Card */}
        <div style={{
          padding: '12px 14px',
          borderRadius: 'var(--radius-card, 8px)',
          background: 'var(--bg-card-soft)',
          border: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {conversation.title || 'Chat Session'}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {conversation.message_count || 0} messages
            </span>
          </div>
          {conversation.preview && (
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.85 }}>
              "{conversation.preview}"
            </div>
          )}
        </div>

        {/* Link Input & Copy Button */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            id="share-link-input"
            type="text"
            readOnly
            value={shareUrl}
            onClick={e => e.target.select()}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 'var(--radius-btn, 6px)',
              background: 'var(--bg-app)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              outline: 'none',
              fontFamily: 'monospace',
              minHeight: '44px',
            }}
          />
          <button
            id="btn-copy-share-link"
            onClick={handleCopy}
            className="btn-touch-target btn-primary-amber"
            style={{
              padding: '10px 18px',
              borderRadius: 'var(--radius-btn, 6px)',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              minHeight: '44px',
            }}
          >
            {copied ? (
              <>
                <Check size={14} strokeWidth={1.8} />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy size={14} strokeWidth={1.8} />
                <span>Copy Link</span>
              </>
            )}
          </button>
        </div>

        {/* Footer info & open in new tab */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Link is active and viewable by anyone.
          </span>
          <button
            onClick={handleOpenLink}
            style={{
              background: 'none', border: 'none', color: 'var(--accent)',
              fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '4px',
              minHeight: '36px',
            }}
          >
            <span>Open preview</span>
            <ExternalLink size={12} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  )
}
