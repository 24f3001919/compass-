// Compass API Client
// In production, use same-origin relative URLs ('') so Vercel transparently proxies
// all /health and /api/* requests to Render, making it 100% immune to Brave Shields & ad-blockers.
// In development, fall back to VITE_API_BASE_URL or http://localhost:8000.
const API_BASE = (
  import.meta.env.DEV
    ? (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000')
    : ''
).replace(/\/$/, '')

export const FALLBACK_TASKS = [
  {
    id: '1',
    title: 'Submit Nebius Token Factory Benchmark',
    domain: 'hackathon',
    project: 'Compass',
    countdown: '2d left (Friday)',
    tags: ['nebius', 'vector', 'benchmark'],
    vector_dim: 768,
    timestamp: 'Just now'
  },
  {
    id: '2',
    title: 'Configured Matryoshka 768-dim embeddings with Nebius Token Factory',
    domain: 'code',
    project: 'Compass',
    countdown: 'Logged from CLI',
    tags: ['qwen3', 'pgvector', 'hnsw'],
    vector_dim: 768,
    timestamp: '2 mins ago'
  },
  {
    id: '3',
    title: 'CS 61C — RISC-V Pipeline Synthesis Report',
    domain: 'coursework',
    project: 'CS 61C',
    countdown: '1d left (Thursday)',
    tags: ['hardware', 'riscv', 'architecture'],
    vector_dim: 768,
    timestamp: '1 hour ago'
  },
  {
    id: '4',
    title: 'Implement Nemotron-3 Nano sub-400ms router function',
    domain: 'code',
    project: 'Compass Core',
    countdown: 'Completed',
    tags: ['nemotron', 'router', 'latency'],
    vector_dim: 768,
    timestamp: '3 hours ago'
  }
]

export function getCurrentUserId() {
  return localStorage.getItem('compass_user_id') || ''
}

export function setCurrentUserId(userId) {
  if (userId) {
    localStorage.setItem('compass_user_id', userId)
    document.cookie = `compass_user_id=${encodeURIComponent(userId)}; path=/; max-age=2592000; SameSite=Lax`
  } else {
    localStorage.removeItem('compass_user_id')
    document.cookie = `compass_user_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
  }
}

export function getAuthHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders }
  const uid = getCurrentUserId()
  if (uid) {
    headers['x-user-id'] = uid
  }
  return headers
}

/**
 * Health check ping — dynamically reports Neon connection or fallback status.
 */
export async function checkBackendHealth() {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4000)

    const res = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      headers: getAuthHeaders(),
      signal: controller.signal
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      return 'Backend Error • HTTP ' + res.status
    }

    const data = await res.json()
    if (data.db_connected || data.status === 'ok') {
      return 'Live • Neon Connected'
    }
    return 'Edge Online • Syncing'
  } catch {
    return 'Backend Offline • Connection Refused'
  }
}

/**
 * Fetch synchronized task list from Neon PostgreSQL with per-account isolation.
 * Accepts an optional domain string to issue a genuine server-side filtered request.
 * Returns empty array if database is empty; falls back to demo tasks only if server is unreachable.
 */
export async function fetchTasks(domain) {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4000)

    const url = domain && domain !== 'all'
      ? `${API_BASE}/api/tasks?domain=${encodeURIComponent(domain)}`
      : `${API_BASE}/api/tasks`

    const res = await fetch(url, {
      headers: getAuthHeaders(),
      signal: controller.signal
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      return FALLBACK_TASKS
    }

    const data = await res.json()
    if (Array.isArray(data)) {
      return data
    }
    return FALLBACK_TASKS
  } catch {
    return FALLBACK_TASKS
  }
}

/**
 * Fetch live usage summary (total calls, tokens, cost) from /api/usage/summary.
 * Public endpoint — no auth required. Returns null on failure.
 */
export async function fetchUsageSummary() {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(`${API_BASE}/api/usage/summary`, { signal: controller.signal })
    clearTimeout(timeoutId)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Send a chat message to the Nebius-powered assistant.
 * Passes conversation_id for multi-turn memory.
 * Returns { response, conversation_id } on success.
 */
export async function sendQueryToAssistant(prompt, conversationId) {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 12000)

    const body = { message: prompt }
    if (conversationId) {
      body.conversation_id = conversationId
    }

    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      signal: controller.signal
    })
    clearTimeout(timeoutId)

    if (res.ok) {
      const data = await res.json()
      const text = data.response || data.message || ''
      if (text) {
        return {
          response: text,
          conversation_id: data.conversation_id || conversationId || null
        }
      }
    }
  } catch (err) {
    console.warn('[Compass Chat] Backend unreachable or timeout.', err)
  }

    // Friendly fallback when backend is offline
    return {
      response: "I'm having trouble connecting right now. Please make sure the backend is running and try again!",
      conversation_id: conversationId || null
    }
  }

/**
 * Stream chat tokens via Server-Sent Events (SSE) from /api/chat/stream.
 * Dispatches incremental tokens via onToken, completion metadata via onComplete,
 * and errors via onError.
 */
export async function streamQueryFromAssistant(prompt, conversationId, { onToken, onComplete, onError } = {}) {
  try {
    const body = { message: prompt }
    if (conversationId) {
      body.conversation_id = conversationId
    }

    const res = await fetch(`${API_BASE}/api/chat/stream`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      throw new Error(`SSE endpoint returned HTTP ${res.status}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullResponse = ''
    let lastConvId = conversationId || null
    let lastSkill = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue
        const jsonStr = trimmed.slice(5).trim()
        if (!jsonStr) continue
        try {
          const evt = JSON.parse(jsonStr)
          if (evt.type === 'token') {
            fullResponse += evt.value
            if (onToken) onToken(evt.value, fullResponse)
          } else if (evt.type === 'done') {
            if (evt.conversation_id) lastConvId = evt.conversation_id
            if (evt.skill_used) lastSkill = evt.skill_used
          } else if (evt.type === 'error') {
            throw new Error(evt.message || 'Stream error')
          }
        } catch (e) {
          console.warn('[Compass SSE Parse Error]', e, jsonStr)
        }
      }
    }

    if (onComplete) {
      onComplete({
        response: fullResponse,
        conversation_id: lastConvId,
        skill_used: lastSkill,
      })
    }
    return {
      response: fullResponse,
      conversation_id: lastConvId,
      skill_used: lastSkill,
    }
  } catch (err) {
    if (onError) {
      onError(err)
    } else {
      throw err
    }
  }
}

// ---------------------------------------------------------------------------
// Calendar & Dynamic Scheduling API
// ---------------------------------------------------------------------------

export async function fetchCalendarStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/calendar/status`, {
      headers: getAuthHeaders(),
    })
    if (!res.ok) return { connected: false, mode: 'demo', account_email: null, is_simulated: false }
    const data = await res.json()
    return data.calendar || { connected: false, mode: 'demo', is_simulated: false }
  } catch {
    return { connected: false, mode: 'demo', account_email: null, is_simulated: false }
  }
}

export async function fetchCurrentUser() {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: getAuthHeaders(),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.authenticated && data.user_id) {
      setCurrentUserId(data.user_id)
    }
    return data
  } catch {
    return null
  }
}

export async function selectAccount(email) {
  const clean = email.trim().toLowerCase()
  const res = await fetch(`${API_BASE}/api/auth/select-account`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email: clean }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Failed to switch account (HTTP ${res.status})`)
  }
  const data = await res.json()
  setCurrentUserId(data.user_id || clean)
  return data
}

export async function logoutUser() {
  setCurrentUserId('')
  try {
    await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', headers: getAuthHeaders() })
  } catch {}
  return { status: 'ok' }
}

export async function checkGoogleOAuthStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/calendar/connect?redirect=false`, {
      headers: getAuthHeaders(),
    })
    if (!res.ok) return { configured: false, status: 'error' }
    const data = await res.json()
    return {
      configured: Boolean(data.configured),
      status: data.status || (data.configured ? 'ok' : 'not_configured'),
      url: data.url,
      message: data.message,
    }
  } catch {
    return { configured: false, status: 'error' }
  }
}

export async function quickConnectUser(email) {
  const clean = email.trim().toLowerCase()
  const res = await fetch(`${API_BASE}/api/auth/quick-connect`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email: clean }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  setCurrentUserId(clean)
  return data
}

export async function syncCalendarNow() {
  const res = await fetch(`${API_BASE}/api/calendar/sync-now`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || err.message || `HTTP ${res.status}`)
  }
  return await res.json()
}

export function getGoogleOAuthConnectUrl(loginHint = null) {
  let url = `${API_BASE}/api/calendar/connect?redirect=true`
  const hint = loginHint || getCurrentUserId()
  if (hint && hint.includes('@')) url += `&login_hint=${encodeURIComponent(hint)}`
  return url
}

export async function disconnectCalendar() {
  try {
    const res = await fetch(`${API_BASE}/api/calendar/disconnect`, {
      method: 'POST',
      headers: getAuthHeaders(),
    })
    return await res.json()
  } catch {
    return { status: 'ok' }
  }
}

export async function fetchCalendarAvailability(startDate, endDate) {
  try {
    let url = `${API_BASE}/api/calendar/availability`
    const params = new URLSearchParams()
    if (startDate) params.append('start_date', startDate)
    if (endDate) params.append('end_date', endDate)
    if (params.toString()) url += `?${params.toString()}`

    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    return json.data || json
  } catch (err) {
    console.warn('[Compass Calendar Availability Fallback]', err)
    return { busy_intervals: [], free_windows: [] }
  }
}

export async function proposeSchedule({ targetDate, domain, taskIds } = {}) {
  const payload = {}
  if (targetDate) payload.target_date = targetDate
  if (domain && domain !== 'all') payload.domain = domain
  if (taskIds && taskIds.length > 0) payload.task_ids = taskIds

  const res = await fetch(`${API_BASE}/api/schedule/propose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return json.data || json
}

export async function commitSchedule(assignments, rationale = 'Committed via Schedule View') {
  const res = await fetch(`${API_BASE}/api/schedule/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assignments, rationale }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return json.data || json
}

export async function fetchSchedulingPreferences() {
  try {
    const res = await fetch(`${API_BASE}/api/calendar/preferences`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch {
    return {
      work_start_time: '09:00:00',
      work_end_time: '18:00:00',
      work_days: [1, 2, 3, 4, 5],
      buffer_minutes: 15,
      preferred_focus: 'morning',
    }
  }
}

export function getCalendarExportUrl(domain) {
  if (domain && domain !== 'all') {
    return `${API_BASE}/api/calendar/export.ics?domain=${encodeURIComponent(domain)}`
  }
  return `${API_BASE}/api/calendar/export.ics`
}

export async function checkReactiveSchedule(currentTime = null) {
  const body = currentTime ? { current_time: currentTime } : {}
  const res = await fetch(`${API_BASE}/api/schedule/reactive-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}

export async function fetchScheduleConflicts() {
  const res = await fetch(`${API_BASE}/api/schedule/conflicts`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json()
}

/**
 * Create a task or deadline directly without relying on AI chat.
 */
export async function createTask(taskData) {
  const res = await fetch(`${API_BASE}/api/tasks`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(taskData)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Failed to create task (HTTP ${res.status})`)
  }
  return await res.json()
}

/**
 * Delete a task or deadline directly by ID without relying on AI chat.
 */
export async function deleteTask(taskId) {
  const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Failed to delete task (HTTP ${res.status})`)
  }
  return await res.json()
}

/**
 * Update/edit any property of a task or deadline directly.
 */
export async function updateTask(taskId, updateData) {
  const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
    method: 'PATCH',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(updateData),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Failed to update deadline (HTTP ${res.status})`)
  }
  return await res.json()
}

/**
 * Dispatch a request to the Specialist Multi-Agent System backend.
 */
export async function dispatchSpecialist({ capability, user_goal, relevant_context }) {
  const res = await fetch(`${API_BASE}/api/specialist/dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      capability,
      user_goal,
      relevant_context,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Specialist dispatch failed (HTTP ${res.status})`)
  }
  return await res.json()
}

// ---------------------------------------------------------------------------
// Conversations History & Connected Memory
// ---------------------------------------------------------------------------

/**
 * Fetch previous chat conversations list.
 */
export async function fetchConversations(limit = 30, includeArchived = false) {
  try {
    const res = await fetch(`${API_BASE}/api/conversations?limit=${limit}&include_archived=${includeArchived}`, {
      headers: getAuthHeaders(),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.conversations || []
  } catch {
    return []
  }
}

/**
 * Fetch all messages from a specific previous conversation.
 */
export async function fetchConversationMessages(conversationId) {
  if (!conversationId) return []
  try {
    const res = await fetch(`${API_BASE}/api/conversations/${conversationId}/messages`, {
      headers: getAuthHeaders(),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.messages || []).map(m => ({
      role: m.role,
      text: m.content,
      created_at: m.created_at,
    }))
  } catch {
    return []
  }
}

/**
 * Update conversation metadata (title, is_pinned, is_archived).
 */
export async function updateConversation(conversationId, updates) {
  if (!conversationId) return false
  try {
    const res = await fetch(`${API_BASE}/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(updates),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Delete a past conversation.
 */
export async function deleteConversation(conversationId) {
  if (!conversationId) return false
  try {
    const res = await fetch(`${API_BASE}/api/conversations/${conversationId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Fetch complete memory overview (previous chats, past plans, active tasks).
 */
export async function fetchMemoryOverview() {
  try {
    const res = await fetch(`${API_BASE}/api/memory/overview`, {
      headers: getAuthHeaders(),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}


