import React, { useState } from 'react'
import InternshipRadar from './InternshipRadar'
import ResumeStudio from './career/ResumeStudio'
import ApplicationCenter from './career/ApplicationCenter'
import RadarProfileModal from './radar/RadarProfileModal'

export default function CareerCopilot() {
  const [activeSubTab, setActiveSubTab] = useState('radar') // 'radar' | 'resumes' | 'applications'
  const [showProfileModal, setShowProfileModal] = useState(false)

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
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              fontWeight: 'bold',
            }}
          >
            🎯
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
              Career Copilot
            </h1>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
              Autonomous discovery, truthful resume tailoring, and authorized application management.
            </p>
          </div>
        </div>

        {/* Action Button: Edit Candidate Profile */}
        <button
          type="button"
          onClick={() => setShowProfileModal(true)}
          style={{
            background: 'var(--bg-card-soft)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            padding: '6px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          ⚙️ Candidate Profile
        </button>
      </div>

      {/* Sub-Tabs Switcher */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          padding: '12px 20px',
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
                padding: '8px 16px',
                borderRadius: '8px',
                border: isActive ? '1px solid var(--primary)' : '1px solid var(--border)',
                background: isActive ? 'var(--primary)' : 'var(--bg-card)',
                color: isActive ? '#fff' : 'var(--text-primary)',
                fontWeight: isActive ? '700' : '500',
                fontSize: '13px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
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
        {activeSubTab === 'radar' && <InternshipRadar />}
        {activeSubTab === 'resumes' && <ResumeStudio />}
        {activeSubTab === 'applications' && <ApplicationCenter />}
      </div>

      {/* Candidate Profile Modal */}
      <RadarProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        onProfileUpdated={() => {}}
      />
    </div>
  )
}
