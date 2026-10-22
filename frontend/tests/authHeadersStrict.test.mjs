import test from 'node:test'
import assert from 'node:assert/strict'

// Polyfill browser globals for Node test environment
if (!globalThis.localStorage) {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  }
}

if (!globalThis.window) {
  globalThis.window = {
    location: {
      hostname: 'localhost'
    }
  }
}

import { getAuthHeaders, getCurrentUserId, setCurrentUserId, setGuestSession, fetchWithGuestRetry } from '../src/api/baseClient.js'

test('Request builder: getAuthHeaders never includes x-user-id or compass_user_id', () => {
  globalThis.localStorage.clear()
  globalThis.localStorage.setItem('compass_user_id', 'test_user@example.com')
  globalThis.localStorage.setItem('compass_user_email', 'test_user@example.com')

  globalThis.window.location.hostname = 'localhost'

  const headers = getAuthHeaders()
  assert.equal(headers['x-user-id'], undefined, 'x-user-id header must never be present')
  assert.equal(headers['compass_user_id'], undefined, 'compass_user_id must never be present as header')
  assert.equal(headers['X-User-Id'], undefined, 'X-User-Id must never be present')
})

test('Request builder: guest credentials include x-guest-token without x-user-id', () => {
  globalThis.localStorage.clear()
  setGuestSession('guest-uuid-1234', 'guest.token.sig')

  const headers = getAuthHeaders()
  assert.equal(headers['x-guest-token'], 'guest.token.sig')
  assert.equal(headers['x-guest-id'], 'guest-uuid-1234')
  assert.equal(headers['x-user-id'], undefined, 'x-user-id header must remain strictly omitted')
  assert.equal(headers['compass_user_id'], undefined)
})

test('Identity store: setCurrentUserId does not store compass_user_id in localStorage', () => {
  globalThis.localStorage.clear()
  setCurrentUserId('student@vit.ac.in')

  assert.equal(globalThis.localStorage.getItem('compass_user_email'), 'student@vit.ac.in')
  assert.equal(globalThis.localStorage.getItem('compass_user_id'), null, 'compass_user_id key must not be written')
})

test('401 Auto-Recovery: fetchWithGuestRetry mints guest session and retries request on 401', async () => {
  globalThis.localStorage.clear()

  let callCount = 0
  let guestMinted = false

  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    callCount++
    if (url.includes('/api/guest/session')) {
      guestMinted = true
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          guest_id: 'auto-minted-guest-uuid',
          guest_token: 'auto-minted-token.1234.sig',
        }),
      }
    }
    if (callCount === 1) {
      return {
        ok: false,
        status: 401,
        json: async () => ({ detail: 'Stale user cookie. Re-authentication required.' }),
      }
    }
    assert.equal(options.headers['x-guest-token'], 'auto-minted-token.1234.sig')
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    }
  }

  try {
    const res = await fetchWithGuestRetry('http://localhost:8000/api/tasks')
    assert.equal(res.status, 200)
    assert.equal(guestMinted, true, 'initGuestSession must be called on 401')
    assert.equal(callCount, 3, 'Initial call (401) + guest mint + retry call (200)')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('401 Guard: fetchWithGuestRetry never downgrades authenticated users and dispatches session_expired event', async () => {
  globalThis.localStorage.clear()
  globalThis.localStorage.setItem('compass_auth_token', 'user-jwt-token-123')
  globalThis.localStorage.setItem('compass_user_email', 'alice@vit.ac.in')

  let guestMinted = false
  let sessionExpiredDispatched = false

  const originalFetch = globalThis.fetch
  const originalDispatch = globalThis.window.dispatchEvent

  globalThis.window.dispatchEvent = (event) => {
    if (event?.type === 'compass:session_expired') {
      sessionExpiredDispatched = true
    }
  }

  globalThis.fetch = async (url) => {
    if (url.includes('/api/guest/session')) {
      guestMinted = true
      return { ok: true, status: 200, json: async () => ({}) }
    }
    return {
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Token expired' }),
    }
  }

  try {
    const res = await fetchWithGuestRetry('http://localhost:8000/api/tasks')
    assert.equal(res.status, 401, 'Must return 401 without retrying as guest')
    assert.equal(guestMinted, false, 'Must NOT mint a guest session for authenticated accounts')
    assert.equal(sessionExpiredDispatched, true, 'Must dispatch compass:session_expired event')
    assert.equal(globalThis.localStorage.getItem('compass_auth_token'), 'user-jwt-token-123', 'User token preserved')
  } finally {
    globalThis.fetch = originalFetch
    globalThis.window.dispatchEvent = originalDispatch
  }
})

test('401 Guard: fetchWithGuestRetry never retries streaming requests', async () => {
  globalThis.localStorage.clear()

  let guestMinted = false
  const originalFetch = globalThis.fetch

  globalThis.fetch = async (url) => {
    if (url.includes('/api/guest/session')) {
      guestMinted = true
      return { ok: true, status: 200, json: async () => ({}) }
    }
    return {
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Unauthorized' }),
    }
  }

  try {
    const res = await fetchWithGuestRetry('http://localhost:8000/api/chat/stream', { isStreaming: true })
    assert.equal(res.status, 401, 'Must return 401 directly without retry')
    assert.equal(guestMinted, false, 'Must not mint guest session for streaming request')
  } finally {
    globalThis.fetch = originalFetch
  }
})
