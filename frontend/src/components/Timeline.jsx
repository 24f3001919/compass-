import React, { useState, useEffect } from 'react'
import { createTask, deleteTask } from '../api/client'

const KNOWN_FIELDS = new Set([
  'id', 'domain', 'project', 'timestamp', 'title', 'tags',
  'countdown', 'vector_dim', 'description'
])

const DOMAIN_META = {
  hackathon: { label: 'Hackathon', icon: '🚀', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.4)' },
  coursework: { label: 'Coursework', icon: '📚', color: '#60a5fa', border: 'rgba(59, 130, 246, 0.4)' },
  code: { label: 'Code', icon: '💻', color: '#34d399', border: 'rgba(16, 185, 129, 0.4)' },
  general: { label: 'General', icon: '🌐', color: '#94a3b8', border: 'rgba(100, 116, 139, 0.4)' },
}

function formatFieldLabel(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function formatFieldValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

function AddDeadlineModal({ isOpen, onClose, onCreated, defaultDomain }) {
  const [title, setTitle] = useState('')
  const [domain, setDomain] = useState('general')
  const [project, setProject] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('medium')
  const [duration, setDuration] = useState(60)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (isOpen) {
      setTitle('')
      setDomain(defaultDomain && defaultDomain !== 'all' ? defaultDomain : 'general')
      setProject('')
      setDueDate('')
      setPriority('medium')
      setDuration(60)
      setNotes('')
      setError(null)
      setLoading(false)
    }
  }, [isOpen, defaultDomain])

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    const cleanTitle = title.trim()
    if (!cleanTitle) {
      setError('Please enter a deadline title.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      await createTask({
        title: cleanTitle,
        domain,
        project: project.trim() || 'General',
        due_date: dueDate || null,
        priority,
        duration_minutes: Number(duration) || 60,
        notes: notes.trim() || null,
      })
      if (onCreated) onCreated()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to create deadline. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2, 6, 15, 0.78)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0d131f',
          borderRadius: '14px',
          border: '1px solid #1e293b',
          width: '100%',
          maxWidth: '540px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '24px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.65)',
          color: '#f8fafc'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#f8fafc', margin: 0, letterSpacing: '-0.3px' }}>
              ➕ Add New Deadline
            </h3>
            <p style={{ fontSize: '12.5px', color: '#94a3b8', margin: '4px 0 0' }}>
              Create a standalone deadline without relying on AI chat
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              color: '#94a3b8',
              width: '28px',
              height: '28px',
              borderRadius: '7px',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            color: '#fca5a5',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '13px',
            marginBottom: '16px'
          }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Domain Selection */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', fontWeight: '700', marginBottom: '8px' }}>
              Domain
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {Object.entries(DOMAIN_META).map(([domKey, meta]) => {
                const isSelected = domain === domKey
                return (
                  <button
                    key={domKey}
                    type="button"
                    onClick={() => setDomain(domKey)}
                    style={{
                      padding: '8px 6px',
                      borderRadius: '8px',
                      border: isSelected ? `1.5px solid ${meta.color}` : '1px solid #1e293b',
                      background: isSelected ? 'rgba(30, 41, 59, 0.9)' : '#111827',
                      color: isSelected ? meta.color : '#94a3b8',
                      fontSize: '12px',
                      fontWeight: isSelected ? '700' : '500',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span style={{ fontSize: '15px' }}>{meta.icon}</span>
                    <span>{meta.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Title */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', fontWeight: '700', marginBottom: '6px' }}>
              Title <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              id="input-deadline-title"
              type="text"
              required
              placeholder="e.g. Submit CS106B Project or Finish Auth Flow"
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #334155',
                background: '#111827',
                color: '#f8fafc',
                fontSize: '13.5px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Project & Due Date Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', fontWeight: '700', marginBottom: '6px' }}>
                Project
              </label>
              <input
                id="input-deadline-project"
                type="text"
                placeholder="e.g. HackMIT, Compass"
                value={project}
                onChange={e => setProject(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  background: '#111827',
                  color: '#f8fafc',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', fontWeight: '700', marginBottom: '6px' }}>
                Deadline Date
              </label>
              <input
                id="input-deadline-date"
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  background: '#111827',
                  color: '#f8fafc',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  colorScheme: 'dark'
                }}
              />
            </div>
          </div>

          {/* Priority & Duration Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', fontWeight: '700', marginBottom: '6px' }}>
                Priority
              </label>
              <select
                id="select-deadline-priority"
                value={priority}
                onChange={e => setPriority(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  background: '#111827',
                  color: '#f8fafc',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent ⚠️</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', fontWeight: '700', marginBottom: '6px' }}>
                Duration (minutes)
              </label>
              <input
                id="input-deadline-duration"
                type="number"
                min="15"
                max="720"
                step="15"
                value={duration}
                onChange={e => setDuration(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #334155',
                  background: '#111827',
                  color: '#f8fafc',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* Notes / Description */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8', fontWeight: '700', marginBottom: '6px' }}>
              Notes & Details
            </label>
            <textarea
              id="input-deadline-notes"
              rows={3}
              placeholder="Additional requirements, notes, links or objectives..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #334155',
                background: '#111827',
                color: '#f8fafc',
                fontSize: '13px',
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Form Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 16px',
                borderRadius: '8px',
                border: '1px solid #334155',
                background: '#1e293b',
                color: '#cbd5e1',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              id="btn-submit-create-deadline"
              type="submit"
              disabled={loading}
              style={{
                padding: '9px 20px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: '700',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {loading ? 'Creating...' : '+ Create Deadline'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TaskDetailModal({ task, onClose, onDelete }) {
  const [deleting, setDeleting] = useState(false)
  if (!task) return null

  const isOverdue = (task.countdown || '').toLowerCase().includes('overdue')
  const extraEntries = Object.entries(task).filter(([key, value]) => {
    if (KNOWN_FIELDS.has(key)) return false
    if (value === null || value === undefined || value === '') return false
    return true
  })

  const handleDelete = async () => {
    if (window.confirm(`Delete deadline "${task.title}"? This cannot be undone.`)) {
      setDeleting(true)
      try {
        await onDelete(task.id)
        onClose()
      } catch (err) {
        alert(`Failed to delete deadline: ${err.message}`)
        setDeleting(false)
      }
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2, 6, 15, 0.72)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`card-${task.domain}`}
        style={{
          background: '#111827',
          borderRadius: '12px',
          border: '1px solid #1f2937',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '85vh',
          overflowY: 'auto',
          padding: '24px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={`badge-${task.domain}`} style={{ fontSize: '10.5px', padding: '2px 7px', borderRadius: '5px', textTransform: 'uppercase', fontWeight: '700' }}>
              {task.domain}
            </span>
            <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '500' }}>
              • {task.project}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              color: '#94a3b8',
              width: '26px',
              height: '26px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              lineHeight: 1,
              flexShrink: 0
            }}
          >
            ✕
          </button>
        </div>

        {/* Title */}
        <div style={{ marginBottom: task.description ? '14px' : '18px' }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', fontWeight: '700', marginBottom: '4px' }}>
            Title
          </div>
          <div style={{ fontSize: '18px', fontWeight: '600', color: '#f8fafc', lineHeight: '1.4' }}>
            {task.title}
          </div>
        </div>

        {/* Description */}
        {task.description && (
          <div style={{ marginBottom: '18px' }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', fontWeight: '700', marginBottom: '4px' }}>
              Description / Notes
            </div>
            <div style={{ fontSize: '13.5px', color: '#cbd5e1', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
              {task.description}
            </div>
          </div>
        )}

        {/* Status Row */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
          <div className={`countdown-badge ${isOverdue ? 'countdown-overdue' : ''}`}>
            {isOverdue && '⚠️ '}
            {task.countdown}
          </div>
          <div className="vector-tag">
            {task.vector_dim || 768}-dim embedded
          </div>
          {task.priority && (
            <div style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '6px',
              background: task.priority === 'urgent' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(100, 116, 139, 0.2)',
              color: task.priority === 'urgent' ? '#f87171' : '#94a3b8',
              fontWeight: '600'
            }}>
              Priority: {task.priority}
            </div>
          )}
        </div>

        {/* Core details grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '110px 1fr',
          rowGap: '10px',
          columnGap: '12px',
          fontSize: '13px',
          marginBottom: extraEntries.length ? '18px' : 0,
          borderTop: '1px solid #1f2937',
          paddingTop: '16px'
        }}>
          <div style={{ color: '#64748b' }}>ID</div>
          <div style={{ color: '#e2e8f0', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>{task.id}</div>

          <div style={{ color: '#64748b' }}>Logged</div>
          <div style={{ color: '#e2e8f0' }}>{task.timestamp}</div>

          <div style={{ color: '#64748b' }}>Tags</div>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {(task.tags || []).length > 0 ? task.tags.map(tag => (
              <span key={tag} style={{ fontSize: '10.5px', background: '#1e293b', color: '#94a3b8', padding: '2px 7px', borderRadius: '4px' }}>
                #{tag}
              </span>
            )) : <span style={{ color: '#64748b' }}>—</span>}
          </div>
        </div>

        {/* Any additional fields present on the task object */}
        {extraEntries.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '110px 1fr',
            rowGap: '10px',
            columnGap: '12px',
            fontSize: '13px',
            borderTop: '1px solid #1f2937',
            paddingTop: '16px'
          }}>
            {extraEntries.map(([key, value]) => (
              <React.Fragment key={key}>
                <div style={{ color: '#64748b' }}>{formatFieldLabel(key)}</div>
                <div style={{ color: '#e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {formatFieldValue(value)}
                </div>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Modal Actions / Direct Delete Button */}
        <div style={{
          marginTop: '20px',
          paddingTop: '16px',
          borderTop: '1px solid #1f2937',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <button
            id="btn-delete-task-modal"
            disabled={deleting}
            onClick={handleDelete}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#f87171',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: '600',
              cursor: deleting ? 'not-allowed' : 'pointer',
              opacity: deleting ? 0.6 : 1,
              transition: 'all 0.15s ease'
            }}
          >
            🗑️ {deleting ? 'Deleting...' : 'Delete Deadline'}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: '#1e293b',
              border: '1px solid #334155',
              color: '#cbd5e1',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Timeline({ tasks, activeDomain, onSelectDomain, onTasksUpdated }) {
  const [selectedTask, setSelectedTask] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const filtered = activeDomain === 'all' ? tasks : tasks.filter(t => t.domain === activeDomain)
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  const handleDelete = async (taskId) => {
    try {
      await deleteTask(taskId)
      if (onTasksUpdated) {
        onTasksUpdated()
      }
    } catch (err) {
      alert(`Failed to delete deadline: ${err.message}`)
      throw err
    }
  }

  return (
    <div className="timeline-container" style={{ background: 'var(--bg-app)' }}>
      {/* Header with Direct Add Deadline Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '22px', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.4px', margin: 0 }}>
            Timeline Feed <span className="serif-accent" style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>— {today}</span>
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: 0 }}>
            What's happening across your workspace today
          </p>
        </div>

        <button
          id="btn-add-deadline"
          onClick={() => setShowAddModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            color: '#ffffff',
            border: 'none',
            padding: '10px 18px',
            borderRadius: '10px',
            fontSize: '13.5px',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
            transition: 'all 0.15s ease',
            flexShrink: 0
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = '0 6px 18px rgba(37, 99, 235, 0.45)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(37, 99, 235, 0.35)'
          }}
        >
          <span style={{ fontSize: '16px', fontWeight: '700', lineHeight: 1 }}>+</span> Add Deadline
        </button>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '22px', flexWrap: 'wrap' }}>
        {['all', 'hackathon', 'coursework', 'code', 'general'].map(dom => (
          <button
            key={dom}
            onClick={() => onSelectDomain(dom)}
            className={`filter-pill ${activeDomain === dom ? 'active' : ''}`}
          >
            {dom}
          </button>
        ))}
      </div>

      {/* Task Stream Feed */}
      <div className="timeline-feed">
        {filtered.length === 0 ? (
          <div style={{
            padding: '48px 20px',
            textAlign: 'center',
            background: 'var(--bg-card)',
            borderRadius: '16px',
            border: '1px dashed var(--border)',
            color: 'var(--text-secondary)',
            marginTop: '10px',
            width: '100%',
            boxSizing: 'border-box'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📭</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
              No deadlines found
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '18px' }}>
              {activeDomain === 'all'
                ? "Your memory stream is clear. You can add deadlines directly below without needing AI chat."
                : `No active deadlines found under ${activeDomain.toUpperCase()} domain.`}
            </div>
            <button
              id="btn-empty-add-deadline"
              onClick={() => setShowAddModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                border: 'none',
                color: '#ffffff',
                padding: '9px 18px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
              }}
            >
              + Add Your First Deadline
            </button>
          </div>
        ) : filtered.map(task => {
          const isOverdue = (task.countdown || '').toLowerCase().includes('overdue')
          const meta = DOMAIN_META[task.domain] || DOMAIN_META.general

          return (
            <div
              key={task.id}
              className={`timeline-card card-${task.domain}`}
              onClick={() => setSelectedTask(task)}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSelectedTask(task)
                }
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: 'var(--bg-card-soft)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '17px',
                    flexShrink: 0
                  }}>
                    {meta.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: '700', color: 'var(--text-primary)' }}>{task.project}</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{task.timestamp}</div>
                  </div>
                </div>

                {/* Badge & Quick Delete Action */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={`badge-${task.domain}`} style={{ fontSize: '10.5px', padding: '3px 9px', borderRadius: '20px', textTransform: 'uppercase', fontWeight: '700', flexShrink: 0 }}>
                    {meta.label}
                  </span>
                  <button
                    className="btn-delete-deadline"
                    id={`btn-delete-task-${task.id}`}
                    title="Delete deadline"
                    onClick={async (e) => {
                      e.stopPropagation()
                      if (window.confirm(`Delete deadline "${task.title}"?`)) {
                        await handleDelete(task.id)
                      }
                    }}
                    style={{
                      background: 'transparent',
                      border: '1px solid transparent',
                      color: '#64748b',
                      width: '26px',
                      height: '26px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '13px',
                      lineHeight: 1,
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.color = '#ef4444'
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'
                      e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.color = '#64748b'
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.borderColor = 'transparent'
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '12px', lineHeight: '1.4' }}>
                {task.title}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {(task.tags || []).map(tag => (
                    <span key={tag} style={{ fontSize: '10.5px', background: 'var(--bg-card-soft)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '20px', border: '1px solid var(--border)' }}>
                      #{tag}
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                  <div className={`countdown-badge ${isOverdue ? 'countdown-overdue' : ''}`}>
                    {isOverdue && '⚠️ '}
                    {task.countdown}
                  </div>
                  <div className="vector-tag">
                    {task.vector_dim || 768}-dim
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <TaskDetailModal
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onDelete={handleDelete}
      />

      <AddDeadlineModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={onTasksUpdated}
        defaultDomain={activeDomain}
      />
    </div>
  )
}
