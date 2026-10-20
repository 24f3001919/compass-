import React, { useState } from 'react'
import InternshipRadar from './InternshipRadar'
import ApplicationCenter from './career/ApplicationCenter'
import RadarProfileModal from './radar/RadarProfileModal'
import { updateRadarProfile } from '../api/radarApi.js'

const ResumeStudio = React.lazy(() => import('./career/ResumeStudio'))

export default function CareerCopilot() {
  const [activeSubTab, setActiveSubTab] = useState('radar') // 'radar' | 'resumes' | 'applications'
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [profileRefreshTrigger, setProfileRefreshTrigger] = useState(0)
  const [notification, setNotification] = useState(null)

  const handleProfileSave = async (newProfile) => {
    // 1. Authenticated API save request
    const updated = await updateRadarProfile(newProfile)
    return updated
  }

  const handleProfileUpdated = () => {
    // 2. Immediately close modal
    setShowProfileModal(false)
    // 3. Return user to the Internship Radar view
    setActiveSubTab('radar')
    // 4. Show success notification
    setNotification({
      type: 'info',
      message: 'Profile saved! Refreshing your internship matches…',
    })
    // 5. Trigger asynchronous recommendation refresh
    setProfileRefreshTrigger(prev => prev + 1)
  }

  const handleRefreshComplete = () => {
    setNotification({
      type: 'success',
      message: '✓ Profile saved! Internship matches have been updated.',
    })
    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      setNotification(prev => (prev?.type === 'success' ? null : prev))
    }, 4000)
  }

  const handleRefreshError = () => {
    setNotification({
      type: 'warning',
      message: 'Profile saved, but could not refresh internship recommendations.',
      canRetry: true,
      onRetry: () => {
        setNotification({
          type: 'info',
          message: 'Retrying internship recommendations refresh…',
        })
        setProfileRefreshTrigger(prev => prev + 1)
      },
    })
  }

  const SUB_TABS = [
    { key: 'radar', icon: '📡', label: 'Internship Radar', desc: 'Verified discovery & eligibility' },
    { key: 'resumes', icon: '📄', label: 'Resume Studio', desc: 'Factual tailoring & ATS export' },
    { key: 'applications', icon: '🚀', label: 'Application Center', desc: 'Pipelines & batch approvals' },
  ]

  return (
    <div
      id="career-copilot-container"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto',
        background: 'var(--bg-app)',
        boxSizing: 'border-box',
      }}
    >
      {/* Top Banner Navigation */}
      <div
        style={{
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border)',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              fontWeight: 'bold',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
            }}
          >
            🎯
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '19px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Career Copilot
            </h1>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Autonomous discovery, truthful resume tailoring, and authorized application management.
            </p>
          </div>
        </div>

        {/* Action Button: Edit Candidate Profile */}
        <button
          type="button"
          onClick={() => setShowProfileModal(true)}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            padding: '8px 16px',
            borderRadius: '9px',
            fontSize: '12.5px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
            transition: 'all 0.15s ease',
          }}
        >
          ⚙️ Candidate Profile
        </button>
      </div>

      {/* Success / Feedback Notification Banner */}
      {notification && (
        <div
          role="status"
          aria-live="polite"
          id="career-copilot-notification"
          style={{
            margin: '12px 20px 0 20px',
            padding: '10px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            background:
              notification.type === 'warning'
                ? 'rgba(245, 158, 11, 0.12)'
                : notification.type === 'success'
                ? 'rgba(16, 185, 129, 0.12)'
                : 'rgba(59, 130, 246, 0.12)',
            color:
              notification.type === 'warning'
                ? '#f59e0b'
                : notification.type === 'success'
                ? '#10b981'
                : '#3b82f6',
            border: `1px solid ${
              notification.type === 'warning'
                ? 'rgba(245, 158, 11, 0.3)'
                : notification.type === 'success'
                ? 'rgba(16, 185, 129, 0.3)'
                : 'rgba(59, 130, 246, 0.3)'
            }`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>
              {notification.type === 'warning' ? '⚡' : notification.type === 'success' ? '✓' : '🔄'}
            </span>
            <span>{notification.message}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {notification.canRetry && (
              <button
                type="button"
                onClick={notification.onRetry}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid currentColor',
                  color: 'inherit',
                  padding: '3px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={() => setNotification(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                fontSize: '16px',
                cursor: 'pointer',
                padding: '0 4px',
                lineHeight: 1,
              }}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Sub-Tabs Switcher */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          padding: '14px 20px',
          background: 'var(--bg-app)',
          borderBottom: '1px solid var(--border)',
          overflowX: 'auto',
        }}
      >
        {SUB_TABS.map((tab) => {
          const isActive = activeSubTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveSubTab(tab.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '9px',
                border: isActive ? '1px solid var(--primary, #2563eb)' : '1px solid var(--border)',
                background: isActive ? 'var(--primary, #2563eb)' : 'var(--bg-card)',
                color: isActive ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: isActive ? '700' : '600',
                fontSize: '13px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                boxShadow: isActive ? '0 3px 10px rgba(37, 99, 235, 0.3)' : '0 1px 2px rgba(15, 23, 42, 0.04)',
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Main Tab Area */}
      <div style={{ flex: 1, padding: '20px 16px' }}>
        {activeSubTab === 'radar' && (
          <InternshipRadar
            refreshTrigger={profileRefreshTrigger}
            onRefreshComplete={handleRefreshComplete}
            onRefreshError={handleRefreshError}
            onOpenProfile={() => setShowProfileModal(true)}
          />
        )}
        {activeSubTab === 'resumes' && (
          <React.Suspense fallback={<div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading Resume Studio…</div>}>
            <ResumeStudio />
          </React.Suspense>
        )}
        {activeSubTab === 'applications' && <ApplicationCenter />}
      </div>

      {/* Candidate Profile Modal */}
      {showProfileModal && (
        <RadarProfileModal
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          onSave={handleProfileSave}
          onProfileUpdated={handleProfileUpdated}
        />
      )}
    </div>
  )
}
