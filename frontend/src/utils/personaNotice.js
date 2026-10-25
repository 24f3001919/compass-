/**
 * Compass — Persona Loading Notice & Error Mapping Utility
 *
 * Maps HTTP status codes, error details, and machine error codes from /api/demo/seed-persona
 * into user-friendly, non-technical, actionable inline notices.
 */

export function mapPersonaError(err) {
  const code = (err && (err.code || (err.detail && err.detail.code))) || ''
  const status = (err && err.status) || 0
  const retryHeader = err && err.retryAfter
  const retryDelay = Math.min(10, Math.max(1, Number(retryHeader) || 5))

  if (code === 'seeding_disabled' || status === 403) {
    return {
      type: 'disabled',
      text: 'Demo loading is turned off on this server.',
      canRetry: false,
    }
  }

  if (status === 401 || code === 'unauthorized' || code === 'authentication_required') {
    return {
      type: 'error',
      text: 'Session expired. Please refresh.',
      canRetry: false,
    }
  }

  if (
    status === 503 ||
    code === 'db_unavailable' ||
    code === 'cold_start' ||
    code === 'rate_limiter_unavailable'
  ) {
    return {
      type: 'info',
      text: 'The server is waking up or temporarily unavailable. Retrying...',
      retryDelay,
      canRetry: true,
      is503: true,
    }
  }

  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false
  const isNetworkMsg = err && err.message && (
    err.message.toLowerCase().includes('network') ||
    err.message.toLowerCase().includes('failed to fetch') ||
    err.message.toLowerCase().includes('connection refused')
  )

  if (isOffline || isNetworkMsg) {
    return {
      type: 'error',
      text: 'Network error. Check your connection.',
      canRetry: true,
    }
  }

  return {
    type: 'error',
    text: 'The server is waking up or temporarily unavailable.',
    canRetry: true,
  }
}
