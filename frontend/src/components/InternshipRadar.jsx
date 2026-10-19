import React, { useState, useEffect, useCallback, useRef } from 'react'
import RadarOverviewCards from './radar/RadarOverviewCards'
import RadarFilters from './radar/RadarFilters'
import RadarOpportunityCard from './radar/RadarOpportunityCard'
import RadarDetailModal from './radar/RadarDetailModal'
import RadarProfileModal from './radar/RadarProfileModal'
import ApplicationWorkspaceModal from './career/ApplicationWorkspaceModal'
import {
  fetchOpportunities,
  fetchRecommendedOpportunities,
  fetchOpenOpportunities,
  fetchUpcomingOpportunities,
  fetchRadarAnalytics,
  fetchWatchlist,
  fetchApplications,
  saveOpportunity,
  unsaveOpportunity,
  updateApplication,
  fetchRadarProfile,
  updateRadarProfile,
  triggerRadarSync,
  verifyOpportunity,
} from '../api/radarApi'

export default function InternshipRadar({
  refreshTrigger = 0,
  onRefreshComplete,
  onRefreshError,
  onOpenProfile,
} = {}) {
  const [activeTab, setActiveTab] = useState('recommended')
  const [opportunities, setOpportunities] = useState([])
  const [stats, setStats] = useState(null)
  const [profile, setProfile] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedEmployerType, setSelectedEmployerType] = useState('')
  const [workArrangement, setWorkArrangement] = useState('')
  const [indiaOnly, setIndiaOnly] = useState(true)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isRefreshingMatches, setIsRefreshingMatches] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const isFirstMountRef = useRef(true)

  const [selectedDetailOpp, setSelectedDetailOpp] = useState(null)
  const [activeWorkspaceOpp, setActiveWorkspaceOpp] = useState(null)
  const [showProfileModal, setShowProfileModal] = useState(false)

  // Load analytics & profile
  const loadMetadata = useCallback(async () => {
    try {
      const [analyticsData, profileData] = await Promise.allSettled([
        fetchRadarAnalytics(),
        fetchRadarProfile(),
      ])
      if (analyticsData.status === 'fulfilled') setStats(analyticsData.value)
      if (profileData.status === 'fulfilled') setProfile(profileData.value)
    } catch (e) {
      console.warn('[Radar] Error fetching metadata:', e)
    }
  }, [])

  // Load list based on active tab and filters
  const loadOpportunities = useCallback(async (options = {}) => {
    const isBackground = options?.background === true
    const targetPage = options?.targetPage || 1
    const isAppending = options?.append === true

    if (!isBackground && !isAppending) {
      setLoading(true)
    }
    if (isAppending) {
      setIsLoadingMore(true)
    }
    setError(null)

    try {
      let items = []
      let serverHasMore = false

      if (activeTab === 'recommended') {
        items = await fetchRecommendedOpportunities(30, selectedEmployerType)
      } else if (activeTab === 'open') {
        items = await fetchOpenOpportunities({
          category: selectedCategory,
          employer_type: selectedEmployerType,
          work_arrangement: workArrangement,
          india_only: indiaOnly,
        })
      } else if (activeTab === 'upcoming') {
        items = await fetchUpcomingOpportunities()
      } else if (activeTab === 'watchlist') {
        items = await fetchWatchlist()
      } else if (activeTab === 'applications') {
        items = await fetchApplications()
      } else {
        // 'all'
        const res = await fetchOpportunities({
          category: selectedCategory,
          employer_type: selectedEmployerType,
          work_arrangement: workArrangement,
          search: searchQuery,
          india_only: indiaOnly,
          page: targetPage,
          pageSize: 24,
        })
        items = res.opportunities || []
        serverHasMore = Boolean(res.has_more)
      }

      // Client-side text search filter if tab is not 'all'
      if (activeTab !== 'all' && searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        items = items.filter(
          o =>
            o.company_name.toLowerCase().includes(q) ||
            o.role_title.toLowerCase().includes(q) ||
            (o.location && o.location.toLowerCase().includes(q))
        )
      }

      // Employer type filter for client-filtered tabs
      if (selectedEmployerType && activeTab !== 'all' && activeTab !== 'open' && activeTab !== 'recommended') {
        items = items.filter(o => o.employer_type === selectedEmployerType)
      }

      // Category filter for tabs other than 'all' and 'open'
      if (activeTab !== 'all' && activeTab !== 'open' && selectedCategory) {
        items = items.filter(o => o.category === selectedCategory)
      }

      // Work arrangement filter
      if (activeTab !== 'all' && activeTab !== 'open' && workArrangement) {
        items = items.filter(o => o.work_arrangement === workArrangement)
      }

      if (isAppending) {
        setOpportunities(prev => [...prev, ...items])
      } else {
        setOpportunities(items)
      }
      setHasMore(serverHasMore)
      setPage(targetPage)
    } catch (err) {
      console.error('[Radar] Error fetching opportunities:', err)
      if (!isBackground) {
        setError(err.message || 'Failed to load opportunities.')
      } else {
        throw err
      }
    } finally {
      if (!isBackground && !isAppending) {
        setLoading(false)
      }
      setIsLoadingMore(false)
    }
  }, [activeTab, selectedCategory, selectedEmployerType, workArrangement, searchQuery, indiaOnly])

  // Asynchronous background refresh for recommendation and eligibility updates
  const handleBackgroundRefresh = useCallback(async () => {
    setIsRefreshingMatches(true)
    try {
      await Promise.all([
        loadMetadata(),
        loadOpportunities({ background: true }),
      ])
      if (typeof onRefreshComplete === 'function') {
        onRefreshComplete()
      }
    } catch (err) {
      console.error('[Radar] Background refresh failed:', err)
      if (typeof onRefreshError === 'function') {
        onRefreshError(err)
      }
    } finally {
      setIsRefreshingMatches(false)
    }
  }, [loadMetadata, loadOpportunities, onRefreshComplete, onRefreshError])

  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false
      return
    }
    if (refreshTrigger > 0) {
      handleBackgroundRefresh()
    }
  }, [refreshTrigger, handleBackgroundRefresh])

  useEffect(() => {
    loadMetadata()
  }, [loadMetadata])

  useEffect(() => {
    loadOpportunities()
  }, [loadOpportunities])

  // Save / Bookmark toggle
  const handleToggleSave = async (id, isCurrentlySaved) => {
    try {
      if (isCurrentlySaved) {
        await unsaveOpportunity(id)
      } else {
        await saveOpportunity(id)
      }
      setOpportunities(prev =>
        prev.map(o => (o.id === id ? { ...o, is_saved: !isCurrentlySaved } : o))
      )
      loadMetadata()
    } catch (err) {
      console.error('Error toggling save:', err)
    }
  }

  // Application tracker update
  const handleUpdateApplication = async (id, payload) => {
    await updateApplication(id, payload)
    setOpportunities(prev =>
      prev.map(o => (o.id === id ? { ...o, application_status: payload.application_status } : o))
    )
    if (selectedDetailOpp && selectedDetailOpp.id === id) {
      setSelectedDetailOpp(prev => ({
        ...prev,
        application_status: payload.application_status,
        personal_deadline: payload.personal_deadline,
        private_notes: payload.private_notes,
      }))
    }
    loadMetadata()
  }

  // Live Official Re-verification
  const handleVerifyOpportunity = async id => {
    setIsVerifying(true)
    try {
      const res = await verifyOpportunity(id)
      setOpportunities(prev =>
        prev.map(o =>
          o.id === id
            ? {
                ...o,
                current_status: res.current_status,
                last_verified_at: res.last_verified_at,
              }
            : o
        )
      )
      if (selectedDetailOpp && selectedDetailOpp.id === id) {
        setSelectedDetailOpp(prev => ({
          ...prev,
          current_status: res.current_status,
          last_verified_at: res.last_verified_at,
        }))
      }
      loadMetadata()
    } catch (err) {
      console.error('Verification failed:', err)
    } finally {
      setIsVerifying(false)
    }
  }

  // Sync sources trigger
  const handleSyncSources = async () => {
    setIsSyncing(true)
    try {
      await triggerRadarSync('all')
      await loadMetadata()
      await loadOpportunities()
    } catch (err) {
      console.error('Sync failed:', err)
    } finally {
      setIsSyncing(false)
    }
  }

  // Save Academic Profile (modal in InternshipRadar)
  const handleSaveProfile = async newProfile => {
    const updated = await updateRadarProfile(newProfile)
    setProfile(updated)
    setShowProfileModal(false)
    // Run background refresh asynchronously without blocking modal close
    handleBackgroundRefresh()
    return updated
  }

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '24px 20px 80px 20px',
        boxSizing: 'border-box',
      }}
    >
      {/* Header Title */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '28px' }}>📡</span>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Internship Radar
          </h1>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '6px',
              background: 'rgba(245, 166, 35, 0.15)',
              color: 'var(--brand-dark)',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            Live Intel
          </span>
        </div>
        <p style={{ margin: '6px 0 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
          Verified AI, software engineering, and research internships for undergraduates in India with deterministic eligibility matching.
        </p>
      </div>

      {/* 1. Overview Metric Cards */}
      <RadarOverviewCards
        stats={stats}
        profile={profile}
        onOpenProfile={onOpenProfile || (() => setShowProfileModal(true))}
        onSelectTab={setActiveTab}
      />

      {/* 2. Filter Bar */}
      <RadarFilters
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        selectedEmployerType={selectedEmployerType}
        onEmployerTypeChange={setSelectedEmployerType}
        indiaOnly={indiaOnly}
        onToggleIndiaOnly={() => setIndiaOnly(prev => !prev)}
        workArrangement={workArrangement}
        onWorkArrangementChange={setWorkArrangement}
        onOpenProfile={onOpenProfile || (() => setShowProfileModal(true))}
        onSync={handleSyncSources}
        isSyncing={isSyncing}
      />

      {/* Scoped Background Refreshing Indicator */}
      {isRefreshingMatches && (
        <div
          role="status"
          aria-live="polite"
          id="radar-refreshing-indicator"
          style={{
            padding: '8px 14px',
            marginBottom: '16px',
            borderRadius: '8px',
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            color: 'var(--primary, #3b82f6)',
            fontSize: '12px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ display: 'inline-block', animation: 'spin 1.5s infinite linear' }}>🔄</span>
          <span>Refreshing internship recommendations and eligibility matches…</span>
        </div>
      )}

      {/* 3. Opportunities List Content */}
      {loading ? (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '32px', animation: 'spin 1.5s infinite linear' }}>⏳</div>
          <div style={{ fontSize: '15px', fontWeight: 600 }}>Loading verified opportunities…</div>
        </div>
      ) : error ? (
        <div
          style={{
            padding: '24px',
            borderRadius: '12px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid #ef4444',
            color: '#dc2626',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <strong>Error:</strong> {error}
          </div>
          <button
            type="button"
            onClick={loadOpportunities}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              background: '#ef4444',
              color: '#ffffff',
              border: 'none',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      ) : opportunities.length === 0 ? (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            borderRadius: '16px',
            background: 'var(--bg-card)',
            border: '1px dashed var(--border)',
          }}
        >
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>🛰️</div>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px 0' }}>
            No opportunities found in this view
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto 16px auto' }}>
            {activeTab === 'watchlist'
              ? 'You have not saved any opportunities to your watchlist yet. Click the star icon on any card to monitor it.'
              : activeTab === 'applications'
              ? 'No applications tracked yet. Set application states to manage your interview timeline.'
              : 'Try broadening your search query, turning off filters, or syncing with discovery providers.'}
          </p>
          <button
            type="button"
            onClick={handleSyncSources}
            disabled={isSyncing}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              background: 'var(--brand)',
              color: '#ffffff',
              border: 'none',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {isSyncing ? 'Syncing Sources…' : 'Trigger Discovery Sync'}
          </button>
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '16px',
            }}
          >
            {opportunities.map(opp => (
              <RadarOpportunityCard
                key={opp.id}
                opportunity={opp}
                onOpenDetail={setSelectedDetailOpp}
                onToggleSave={handleToggleSave}
                onUpdateAppStatus={handleUpdateApplication}
                onApply={setActiveWorkspaceOpp}
              />
            ))}
          </div>
          {hasMore && (
            <div style={{ textAlign: 'center', marginTop: '28px' }}>
              <button
                type="button"
                onClick={() => {
                  if (!isLoadingMore) {
                    loadOpportunities({ append: true, targetPage: page + 1 })
                  }
                }}
                disabled={isLoadingMore}
                style={{
                  padding: '10px 24px',
                  borderRadius: '8px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: isLoadingMore ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                {isLoadingMore ? (
                  <>
                    <span style={{ animation: 'spin 1s infinite linear' }}>⏳</span>
                    <span>Loading more opportunities…</span>
                  </>
                ) : (
                  <>
                    <span>Load More Opportunities</span>
                    <span>↓</span>
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}

      {/* Detail & History Modal */}
      {selectedDetailOpp && (
        <RadarDetailModal
          opportunity={selectedDetailOpp}
          onClose={() => setSelectedDetailOpp(null)}
          onUpdateApp={handleUpdateApplication}
          onVerify={handleVerifyOpportunity}
          isVerifying={isVerifying}
          onApply={setActiveWorkspaceOpp}
        />
      )}

      {/* Internal Application Workspace Modal */}
      {activeWorkspaceOpp && (
        <ApplicationWorkspaceModal
          opportunity={activeWorkspaceOpp}
          onClose={() => setActiveWorkspaceOpp(null)}
          onApplicationUpdated={(updatedApp) => {
            setOpportunities(prev =>
              prev.map(o => (o.id === activeWorkspaceOpp.id ? { ...o, application_status: updatedApp.status } : o))
            )
            loadMetadata()
          }}
        />
      )}

      {/* Academic Profile Modal */}
      {showProfileModal && (
        <RadarProfileModal
          isOpen={showProfileModal}
          profile={profile}
          onClose={() => setShowProfileModal(false)}
          onSave={handleSaveProfile}
          isSaving={false}
        />
      )}
    </div>
  )
}
