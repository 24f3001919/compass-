// Compass Base API Client
// Handles base URL resolution, guest identity, user session, and common headers.

export const RENDER_BACKEND_URL = 'https://compass-backend-qryu.onrender.com'

const isLocalDevHost = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

function resolveInitialApiBase() {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '')
  }
  try {
    const saved = localStorage.getItem('compass_active_api_base')
    if (saved) return saved.replace(/\/$/, '')
  } catch {
    /* ignore storage access error */
  }
  if (isLocalDevHost) {
    return 'http://localhost:8000'
  }
  return ''
}

export let API_BASE = resolveInitialApiBase()

export function setApiBase(newBase) {
  API_BASE = (newBase || '').replace(/\/$/, '')
  try {
    if (API_BASE) {
      localStorage.setItem('compass_active_api_base', API_BASE)
    } else {
      localStorage.removeItem('compass_active_api_base')
    }
  } catch {
    /* ignore storage access error */
  }
}


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

const DEFAULT_ACCOUNTS = ['demo@compass.app', 'researcher@compass.app']

export function getKnownAccounts() {
  try {
    const raw = localStorage.getItem('compass_known_accounts')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        const merged = [...parsed]
        for (const def of DEFAULT_ACCOUNTS) {
          if (!merged.includes(def)) merged.push(def)
        }
        return merged
      }
    }
  } catch {
    /* ignore storage access error */
  }
  return DEFAULT_ACCOUNTS
}

export function addKnownAccount(email) {
  if (!email || !email.includes('@')) return
  const clean = email.trim().toLowerCase()
  const list = getKnownAccounts()
  const filtered = list.filter(e => e !== clean)
  filtered.unshift(clean)
  try {
    localStorage.setItem('compass_known_accounts', JSON.stringify(filtered.slice(0, 6)))
  } catch {
    /* ignore storage access error */
  }
}

export function getGuestToken() {
  try {
    return localStorage.getItem('compass_guest_token') || null
  } catch {
    return null
  }
}

export function getGuestId() {
  try {
    return localStorage.getItem('compass_guest_id') || null
  } catch {
    return null
  }
}

export function setGuestSession(guestId, guestToken) {
  try {
    if (guestId && guestToken) {
      localStorage.setItem('compass_guest_id', guestId)
      localStorage.setItem('compass_guest_token', guestToken)
    } else {
      localStorage.removeItem('compass_guest_id')
      localStorage.removeItem('compass_guest_token')
    }
  } catch {
    /* ignore storage access error */
  }
}

export async function initGuestSession() {
  try {
    const existingToken = getGuestToken()
    const res = await fetch(`${API_BASE}/api/guest/session`, {
      method: existingToken ? 'GET' : 'POST',
      headers: existingToken ? { 'x-guest-token': existingToken } : {},
      credentials: 'include',
    })
    if (res.ok) {
      const data = await res.json()
      if (data.guest_id && data.guest_token) {
        setGuestSession(data.guest_id, data.guest_token)
        return data
      }
    }
    if (existingToken) {
      const freshRes = await fetch(`${API_BASE}/api/guest/session`, {
        method: 'POST',
        credentials: 'include',
      })
      if (freshRes.ok) {
        const data = await freshRes.json()
        if (data.guest_id && data.guest_token) {
          setGuestSession(data.guest_id, data.guest_token)
          return data
        }
      }
    }
  } catch (err) {
    console.warn('[Compass] Guest session init failed:', err)
  }
  return null
}

export function getCurrentUserId() {
  let uid = localStorage.getItem('compass_user_email') || localStorage.getItem('compass_user_id')
  if (uid && uid.trim() && uid.includes('@')) {
    return uid.trim().toLowerCase()
  }

  if (typeof document !== 'undefined') {
    const cookieMatch = document.cookie.match(/(?:^|;\s*)compass_user_id=([^;]+)/)
    if (cookieMatch && cookieMatch[1]) {
      uid = decodeURIComponent(cookieMatch[1]).trim().toLowerCase()
      if (uid && uid.includes('@')) {
        localStorage.setItem('compass_user_id', uid)
        localStorage.setItem('compass_user_email', uid)
        addKnownAccount(uid)
        return uid
      }
    }
  }

  return null
}

export function setCurrentUserId(userId) {
  if (userId && userId.trim()) {
    const clean = userId.trim().toLowerCase()
    localStorage.setItem('compass_user_id', clean)
    if (clean.includes('@')) {
      localStorage.setItem('compass_user_email', clean)
      addKnownAccount(clean)
    }
  } else {
    localStorage.removeItem('compass_user_id')
    localStorage.removeItem('compass_user_email')
  }
  // Proactively clear obsolete compass_user_id cookie that triggers production impersonation errors
  if (typeof document !== 'undefined') {
    try {
      document.cookie = 'compass_user_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax; Secure'
    } catch {
      /* ignore cookie cleanup error */
    }
  }
}

export function getAuthHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders }
  const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  const uid = getCurrentUserId()
  if (uid && isDev) {
    headers['x-user-id'] = uid
  }
  const guestToken = getGuestToken()
  if (guestToken) {
    headers['x-guest-token'] = guestToken
  }
  const guestId = getGuestId()
  if (guestId) {
    headers['x-guest-id'] = guestId
  }
  const token = localStorage.getItem('compass_auth_token') || (isDev ? 'dev-token' : '')
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

let inflightHealthCheck = null

export async function checkBackendHealth(force = false) {
  if (inflightHealthCheck && !force) {
    return inflightHealthCheck
  }

  inflightHealthCheck = (async () => {
    // Helper to probe an endpoint with a custom timeout
    const probe = async (url, timeoutMs) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: getAuthHeaders(),
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        return res
      } catch (err) {
        clearTimeout(timeoutId)
        throw err
      }
    }

    try {
      // 1. If currently configured for localhost, test localhost first with a quick 2.5s timeout
      const isLocal = API_BASE.includes('localhost') || API_BASE.includes('127.0.0.1')
      let res = null
      let usedBase = API_BASE

      if (isLocal) {
        try {
          res = await probe(`${API_BASE}/health`, 2500)
        } catch {
          // Local server is not running on port 8000. Fall back to cloud backend immediately.
          console.info(`[Compass] Local backend (${API_BASE}) unreachable. Attempting cloud backend: ${RENDER_BACKEND_URL}`)
          try {
            res = await probe(`${RENDER_BACKEND_URL}/health`, 35000)
            if (res && (res.ok || res.status === 200)) {
              setApiBase(RENDER_BACKEND_URL)
              usedBase = RENDER_BACKEND_URL
            }
          } catch {
            // Cloud backend is also waking up
            return 'Waking up the server…'
          }
        }
      } else {
        // 2. Production or Cloud target — allow 35s for Render cold start
        try {
          res = await probe(`${API_BASE || ''}/health`, 35000)
        } catch {
          // If relative proxy (/health on Vercel) timed out or failed, attempt direct Render URL
          if (!API_BASE && RENDER_BACKEND_URL) {
            try {
              res = await probe(`${RENDER_BACKEND_URL}/health`, 35000)
              if (res && res.ok) {
                setApiBase(RENDER_BACKEND_URL)
                usedBase = RENDER_BACKEND_URL
              }
            } catch {
              return 'Waking up the server…'
            }
          } else {
            return 'Waking up the server…'
          }
        }
      }

      if (!res) {
        return 'Waking up the server…'
      }

      if (!res.ok) {
        // If HTTP 502/503/504, Render or proxy is still booting up
        if ([502, 503, 504].includes(res.status)) {
          return 'Waking up the server…'
        }
        return 'Backend Error • HTTP ' + res.status
      }

      const data = await res.json()
      if (data.db_connected || data.status === 'ok') {
        return 'Live • Neon Connected'
      }
      return 'Edge Online • Syncing'
    } catch {
      return 'Waking up the server…'
    } finally {
      inflightHealthCheck = null
    }
  })()

  return inflightHealthCheck
}

