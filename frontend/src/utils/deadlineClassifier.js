/**
 * Compass — Deterministic Deadline Classification Engine (Frontend)
 *
 * Implements strict 4-dimensional classification:
 * 1. Lifecycle Status: pending, in_progress, completed, blocked, cancelled
 * 2. Deadline Timing: overdue, due_today, urgent, due_soon, upcoming, no_deadline
 * 3. Priority: urgent, high, medium, low
 * 4. Data Origin: user, demo
 *
 * Deterministic Precedence Rules:
 * 1. Completed and cancelled tasks must not appear as active deadlines.
 * 2. Active tasks without deadlines are no_deadline.
 * 3. Unfinished tasks whose actual deadline has passed are overdue.
 * 4. Future deadlines falling on the user's current local calendar day are due_today.
 * 5. Deadlines within the next 24 hours, outside the due_today category, are urgent.
 * 6. Remaining deadlines within the next seven days are due_soon.
 * 7. More distant future deadlines are upcoming.
 *
 * Date-only deadlines remain due_today throughout their local calendar day (ending at 23:59:59).
 * Timestamp-based deadlines transition to overdue the instant they pass.
 */

/**
 * Robust timezone-safe local date parser.
 * Converts YYYY-MM-DD into a local Date at 23:59:59 so date-only deadlines
 * remain valid throughout their intended local calendar day.
 */
export function parseDeadlineDate(dueDateStr) {
  if (!dueDateStr || typeof dueDateStr !== 'string') return { date: null, isDateOnly: false }
  const trimmed = dueDateStr.trim()
  if (!trimmed) return { date: null, isDateOnly: false }

  // Date-only YYYY-MM-DD pattern
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number)
    if (isNaN(y) || isNaN(m) || isNaN(d)) return { date: null, isDateOnly: false }
    return {
      date: new Date(y, m - 1, d, 23, 59, 59, 999),
      isDateOnly: true,
      year: y,
      month: m - 1,
      day: d,
    }
  }

  const parsed = new Date(trimmed)
  return isNaN(parsed.getTime()) ? { date: null, isDateOnly: false } : { date: parsed, isDateOnly: false }
}

/**
 * Classifies deadline urgency with real mathematical time differences and strict precedence.
 */
export function classifyDeadline(task, now = new Date()) {
  if (!task || typeof task !== 'object') {
    return {
      lifecycle: 'pending',
      timing: 'no_deadline',
      priority: 'medium',
      origin: 'user',
      type: 'none',
      label: 'Active',
      diffHours: 9999,
      diffDays: 9999,
      isUrgent: false,
      isOverdue: false,
      isActiveDeadline: false,
    }
  }

  // Dimension 1: Lifecycle Status
  const status = (task.status || 'open').toLowerCase().trim()
  const countdown = (task.countdown || '').toLowerCase().trim()
  const isCompleted = status === 'completed' || status === 'done' || countdown === 'completed'
  const isCancelled = status === 'cancelled' || status === 'canceled'

  let lifecycle = 'pending'
  if (isCompleted) {
    lifecycle = 'completed'
  } else if (isCancelled) {
    lifecycle = 'cancelled'
  } else if (status === 'in_progress') {
    lifecycle = 'in_progress'
  } else if (status === 'blocked') {
    lifecycle = 'blocked'
  }

  // Dimension 3: Priority
  const rawPriority = (task.priority || 'medium').toLowerCase().trim()
  const priority = ['urgent', 'high', 'medium', 'low'].includes(rawPriority) ? rawPriority : 'medium'

  // Dimension 4: Data Origin
  const taskIdStr = String(task.id || '')
  const isDemo = Boolean(
    task.is_demo ||
    task.is_fallback ||
    taskIdStr.startsWith('demo-') ||
    taskIdStr.startsWith('mock-') ||
    taskIdStr.startsWith('sim-') ||
    (Array.isArray(task.tags) && task.tags.includes('demo')) ||
    (task.trusted_event_url && String(task.trusted_event_url).toLowerCase().includes('demo')) ||
    (task.notes && String(task.notes).toLowerCase().includes('demo persona'))
  )
  const origin = isDemo ? 'demo' : 'user'

  // Precedence 1: Completed and cancelled tasks must not appear as active deadlines
  if (isCompleted) {
    return {
      lifecycle: 'completed',
      timing: 'completed',
      priority,
      origin,
      type: 'completed',
      label: 'Completed',
      diffHours: 9999,
      diffDays: 9999,
      isUrgent: false,
      isOverdue: false,
      isActiveDeadline: false,
    }
  }

  if (isCancelled) {
    return {
      lifecycle: 'cancelled',
      timing: 'cancelled',
      priority,
      origin,
      type: 'cancelled',
      label: 'Cancelled',
      diffHours: 9999,
      diffDays: 9999,
      isUrgent: false,
      isOverdue: false,
      isActiveDeadline: false,
    }
  }

  const { date: dueDate, isDateOnly } = parseDeadlineDate(task.due_date)

  // Precedence 2: Active tasks without deadlines are no_deadline
  if (!dueDate) {
    return {
      lifecycle,
      timing: 'no_deadline',
      priority,
      origin,
      type: 'none',
      label: task.countdown || 'No deadline',
      diffHours: 9999,
      diffDays: 9999,
      isUrgent: false,
      isOverdue: false,
      isActiveDeadline: false,
    }
  }

  const nowMs = now.getTime()
  const dueMs = dueDate.getTime()
  const diffHours = (dueMs - nowMs) / (1000 * 60 * 60)

  // Local calendar boundaries for accurate day comparisons
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()


  // Calculate calendar day difference
  const dueStartOfDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime()
  const diffCalendarDays = Math.round((dueStartOfDay - todayStart) / (1000 * 60 * 60 * 24))

  // Precedence 3: Unfinished tasks whose actual deadline has passed are overdue
  // For date-only deadlines: overdue only when the calendar day has fully ended (< todayStart)
  // For timestamp deadlines: overdue immediately when dueMs < nowMs
  const hasPassed = isDateOnly ? dueMs < todayStart : dueMs < nowMs

  if (hasPassed) {
    const overdueDays = Math.max(1, Math.abs(diffCalendarDays))
    return {
      lifecycle,
      timing: 'overdue',
      priority,
      origin,
      type: 'overdue',
      label: `⚠️ Overdue (${overdueDays}d ago)`,
      diffHours,
      diffDays: diffCalendarDays,
      isUrgent: true,
      isOverdue: true,
      isActiveDeadline: true,
    }
  }

  // Precedence 4: Future deadlines falling on the user's current local calendar day are due_today
  const isSameCalendarDay =
    dueDate.getFullYear() === now.getFullYear() &&
    dueDate.getMonth() === now.getMonth() &&
    dueDate.getDate() === now.getDate()

  if (isSameCalendarDay) {
    return {
      lifecycle,
      timing: 'due_today',
      priority,
      origin,
      type: 'today',
      label: '⚠️ Due today',
      diffHours,
      diffDays: 0,
      isUrgent: true,
      isOverdue: false,
      isActiveDeadline: true,
    }
  }

  // Precedence 5: Deadlines within the next 24 hours, outside the due_today category, are urgent
  if (diffHours <= 24 && diffHours > 0) {
    const hoursInt = Math.max(1, Math.round(diffHours))
    return {
      lifecycle,
      timing: 'urgent',
      priority,
      origin,
      type: 'urgent',
      label: `🚨 Due in ${hoursInt}h`,
      diffHours,
      diffDays: diffCalendarDays,
      isUrgent: true,
      isOverdue: false,
      isActiveDeadline: true,
    }
  }

  // Precedence 6: Remaining deadlines within the next seven days are due_soon
  if (diffCalendarDays <= 7 && diffCalendarDays >= 0) {
    const dayName = dueDate.toLocaleDateString('en-US', { weekday: 'short' })
    return {
      lifecycle,
      timing: 'due_soon',
      priority,
      origin,
      type: 'week',
      label: `${diffCalendarDays}d left (${dayName})`,
      diffHours,
      diffDays: diffCalendarDays,
      isUrgent: false,
      isOverdue: false,
      isActiveDeadline: true,
    }
  }

  // Precedence 7: More distant future deadlines are upcoming
  return {
    lifecycle,
    timing: 'upcoming',
    priority,
    origin,
    type: 'future',
    label: `${diffCalendarDays}d left`,
    diffHours,
    diffDays: diffCalendarDays,
    isUrgent: false,
    isOverdue: false,
    isActiveDeadline: true,
  }
}

/**
 * Filter tasks strictly by the requested contextual view.
 */
export function filterTasksByView(tasks, view, now = new Date()) {
  if (!Array.isArray(tasks)) return []
  const v = (view || 'all').toLowerCase().trim()
  if (v === 'all') return tasks

  return tasks.filter((task) => {
    const c = classifyDeadline(task, now)
    switch (v) {
      case 'overdue':
        return c.timing === 'overdue' && c.isActiveDeadline
      case 'due_today':
        return c.timing === 'due_today' && c.isActiveDeadline
      case 'urgent':
        return (c.timing === 'urgent' || c.timing === 'due_today') && c.isActiveDeadline
      case 'due_soon':
        return c.timing === 'due_soon' && c.isActiveDeadline
      case 'upcoming':
        return c.timing === 'upcoming' && c.isActiveDeadline
      case 'pending':
      case 'pending_tasks':
        return c.lifecycle === 'pending'
      case 'in_progress':
        return c.lifecycle === 'in_progress'
      case 'completed':
        return c.lifecycle === 'completed'
      case 'blocked':
        return c.lifecycle === 'blocked'
      case 'cancelled':
        return c.lifecycle === 'cancelled'
      default:
        return true
    }
  })
}

/**
 * Priority weighting for consistent sorting: urgent (0) > high (1) > medium (2) > low (3).
 */
const PRIORITY_WEIGHTS = { urgent: 0, high: 1, medium: 2, low: 3 }

/**
 * Sort overdue tasks consistently: highest priority first, then most overdue first.
 */
export function sortOverdueDeadlines(tasks, now = new Date()) {
  if (!Array.isArray(tasks)) return []
  return tasks
    .filter((t) => {
      const c = classifyDeadline(t, now)
      return c.timing === 'overdue' && c.isActiveDeadline
    })
    .map((t) => ({ ...t, urgency: classifyDeadline(t, now) }))
    .sort((a, b) => {
      const prioA = PRIORITY_WEIGHTS[a.urgency.priority] ?? 2
      const prioB = PRIORITY_WEIGHTS[b.urgency.priority] ?? 2
      if (prioA !== prioB) return prioA - prioB
      // Most overdue (largest negative diffDays or lowest diffHours) first
      return a.urgency.diffHours - b.urgency.diffHours
    })
}

/**
 * Sort upcoming deadlines strictly: nearest future deadline first.
 * Never includes overdue, completed, or cancelled tasks.
 */
export function sortUpcomingDeadlines(tasks, now = new Date()) {
  if (!Array.isArray(tasks)) return []
  return tasks
    .filter((t) => {
      const c = classifyDeadline(t, now)
      return (
        c.isActiveDeadline &&
        !c.isOverdue &&
        (c.timing === 'due_today' || c.timing === 'urgent' || c.timing === 'due_soon' || c.timing === 'upcoming')
      )
    })
    .map((t) => ({ ...t, urgency: classifyDeadline(t, now) }))
    .sort((a, b) => a.urgency.diffHours - b.urgency.diffHours)
}
