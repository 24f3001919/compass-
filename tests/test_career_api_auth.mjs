/**
 * Compass — Career API Authentication & Client Invariant Regression Tests.
 *
 * Verifies:
 * 1. Career API requests use shared authentication helper (`getAuthHeaders`).
 * 2. Valid guest token is sent via `x-guest-token` header.
 * 3. Raw `compass_guest_id` UUID without token is NEVER fabricated or sent as a valid guest token.
 * 4. Multipart resume uploads remove `Content-Type` so browser can set boundary automatically.
 * 5. All career requests use `credentials: 'include'`.
 * 6. `ensureSession()` initializes guest session if missing before issuing career requests.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

// Minimal LocalStorage polyfill for Node.js
class MockLocalStorage {
  constructor() {
    this.store = new Map()
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null
  }
  setItem(key, value) {
    this.store.set(key, String(value))
  }
  removeItem(key) {
    this.store.delete(key)
  }
  clear() {
    this.store.clear()
  }
}

globalThis.window = {
  location: { hostname: 'localhost' },
}
globalThis.localStorage = new MockLocalStorage()

// Intercept fetch calls
let capturedRequests = []
globalThis.fetch = async (url, options = {}) => {
  capturedRequests.push({ url, options })
  if (url.includes('/api/guest/session')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        guest_id: 'auto-guest-123',
        guest_token: 'auto-guest-123.1792433000.testsig123',
        is_new: true,
      }),
    }
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, title: 'Master Resume', id: 99 }),
  }
}

const careerApi = await import('../frontend/src/api/careerApi.js')
const baseClient = await import('../frontend/src/api/baseClient.js')

test('Career API: Sends x-guest-token and credentials include when guest session exists', async () => {
  localStorage.clear()
  capturedRequests = []

  baseClient.setGuestSession('guest-uuid-1', 'guest-uuid-1.1792433000.sigabc')

  await careerApi.fetchMasterResume()

  assert.equal(capturedRequests.length, 1)
  const req = capturedRequests[0]
  assert.match(req.url, /\/api\/career\/resumes\/master/)
  assert.equal(req.options.credentials, 'include')
  assert.equal(req.options.headers['x-guest-token'], 'guest-uuid-1.1792433000.sigabc')
  assert.equal(req.options.headers['x-guest-id'], 'guest-uuid-1')
})

test('Career API: Raw compass_guest_id without token is never sent as x-guest-token', async () => {
  localStorage.clear()
  capturedRequests = []

  // Simulate an unsynced raw UUID in storage without a signed token
  localStorage.setItem('compass_guest_id', 'raw-uuid-only')

  await careerApi.fetchResumes()

  // ensureSession should have triggered initGuestSession because no guest token was in storage
  const guestInitReq = capturedRequests.find(r => r.url.includes('/api/guest/session'))
  assert.ok(guestInitReq, 'Should have triggered guest session init')

  const resumesReq = capturedRequests.find(r => r.url.includes('/api/career/resumes'))
  assert.ok(resumesReq)
  assert.equal(resumesReq.options.credentials, 'include')
  // Must NOT treat raw UUID as the signed token
  assert.notEqual(resumesReq.options.headers['x-guest-token'], 'raw-uuid-only')
})

test('Career API: Multipart upload removes Content-Type for browser boundary generation', async () => {
  localStorage.clear()
  capturedRequests = []

  baseClient.setGuestSession('guest-uuid-2', 'guest-uuid-2.1792433000.sigdef')

  const fakeFile = { name: 'resume.pdf', size: 1024 }
  // Polyfill FormData for node environment
  globalThis.FormData = class {
    constructor() { this.data = new Map() }
    append(k, v) { this.data.set(k, v) }
  }

  await careerApi.parseResumeFile(fakeFile)

  const uploadReq = capturedRequests.find(r => r.url.includes('/api/career/resumes/parse-file'))
  assert.ok(uploadReq, 'parse-file request must be sent')
  assert.equal(uploadReq.options.method, 'POST')
  assert.equal(uploadReq.options.credentials, 'include')
  assert.equal(uploadReq.options.headers['x-guest-token'], 'guest-uuid-2.1792433000.sigdef')
  assert.equal(uploadReq.options.headers['Content-Type'], undefined, 'Content-Type must be deleted for multipart boundary')
  assert.ok(uploadReq.options.body instanceof globalThis.FormData, 'Body must be FormData instance')
})

test('Career API: Mutation endpoints send JSON headers, credentials, and guest token', async () => {
  localStorage.clear()
  capturedRequests = []

  baseClient.setGuestSession('guest-uuid-3', 'guest-uuid-3.1792433000.sighij')

  await careerApi.tailorResume(101, 'AI Engineer', ['Python', 'Docker'])

  const tailorReq = capturedRequests.find(r => r.url.includes('/api/career/resumes/tailor'))
  assert.ok(tailorReq)
  assert.equal(tailorReq.options.method, 'POST')
  assert.equal(tailorReq.options.credentials, 'include')
  assert.equal(tailorReq.options.headers['Content-Type'], 'application/json')
  assert.equal(tailorReq.options.headers['x-guest-token'], 'guest-uuid-3.1792433000.sighij')
  assert.match(tailorReq.options.body, /"opportunity_id":101/)
})

test('Career API: GitHub Intelligence request sends shared auth and credentials', async () => {
  localStorage.clear()
  capturedRequests = []

  baseClient.setGuestSession('guest-uuid-4', 'guest-uuid-4.1792433000.sigklm')

  await careerApi.analyzeGitHubProfile('testuser')

  const ghReq = capturedRequests.find(r => r.url.includes('/api/career/intelligence/github'))
  assert.ok(ghReq)
  assert.equal(ghReq.options.method, 'POST')
  assert.equal(ghReq.options.credentials, 'include')
  assert.equal(ghReq.options.headers['Content-Type'], 'application/json')
  assert.equal(ghReq.options.headers['x-guest-token'], 'guest-uuid-4.1792433000.sigklm')
  assert.match(ghReq.options.body, /"username_or_url":"testuser"/)
})
