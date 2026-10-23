import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLocation, buildUrl } from '../src/router.js'
import { fetchSharedConversation } from '../src/api/client.js'

test('router: parseLocation correctly detects and parses share query parameter and pathname', () => {
  // 1. Query parameter ?share=<token>
  const loc1 = parseLocation('/', '?share=sec_token_987654321')
  assert.equal(loc1.tab, 'share')
  assert.equal(loc1.shareToken, 'sec_token_987654321')
  assert.equal(loc1.domain, 'all')

  // 2. Query parameter with additional params and special chars
  const loc2 = parseLocation('/compass', '?foo=bar&share=xyz_token-123_abc%2B&tab=dashboard')
  assert.equal(loc2.tab, 'share')
  assert.equal(loc2.shareToken, 'xyz_token-123_abc+')

  // 3. Pathname /share/<token>
  const loc3 = parseLocation('/share/sec_path_token_xyz', '')
  assert.equal(loc3.tab, 'share')
  assert.equal(loc3.shareToken, 'sec_path_token_xyz')

  // 4. Missing share parameter continues to route to regular tabs
  const locHome = parseLocation('/', '')
  assert.equal(locHome.tab, 'dashboard')

  const locCompass = parseLocation('/compass', '')
  assert.equal(locCompass.tab, 'compass')

  const locSchedule = parseLocation('/schedule', '')
  assert.equal(locSchedule.tab, 'calendar')

  const locTimeline = parseLocation('/timeline', '?domain=hackathon')
  assert.equal(locTimeline.tab, 'timeline')
  assert.equal(locTimeline.domain, 'hackathon')
})

test('router: buildUrl builds canonical share URLs with encoding', () => {
  assert.equal(buildUrl('share', 'all', 'token_123'), '/?share=token_123')
  assert.equal(buildUrl('share', 'all', 'token with spaces&symbols'), '/?share=token%20with%20spaces%26symbols')
  assert.equal(buildUrl('dashboard', 'all'), '/')
  assert.equal(buildUrl('compass', 'all'), '/compass')
  assert.equal(buildUrl('calendar', 'all'), '/schedule')
})

test('api: fetchSharedConversation validates parameters and handles network and HTTP responses safely', async () => {
  // Save original fetch
  const originalFetch = globalThis.fetch

  try {
    // 1. Missing or blank token returns null immediately without making request
    let fetchCalled = false
    globalThis.fetch = async () => {
      fetchCalled = true
      return new Response('{}', { status: 200 })
    }

    assert.equal(await fetchSharedConversation(null), null)
    assert.equal(await fetchSharedConversation(''), null)
    assert.equal(await fetchSharedConversation('   '), null)
    assert.equal(fetchCalled, false)

    // 2. Successful fetch calls correct endpoint /api/chat/shared/<token>
    let requestedUrl = ''
    const mockMessages = [
      { id: 1, role: 'user', content: 'Hello Compass', created_at: '2026-10-22T00:00:00Z' },
      { id: 2, role: 'assistant', content: 'Hello! How can I help?', created_at: '2026-10-22T00:00:01Z' },
    ]
    globalThis.fetch = async (url) => {
      requestedUrl = url
      return new Response(JSON.stringify({
        share_token: 'valid_secure_token_123',
        title: 'Project Roadmap',
        started_at: '2026-10-22T00:00:00Z',
        last_active_at: '2026-10-22T00:05:00Z',
        messages: mockMessages,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const res = await fetchSharedConversation('valid_secure_token_123')
    assert.ok(requestedUrl.includes('/api/chat/shared/valid_secure_token_123'))
    assert.ok(res !== null)
    assert.equal(res.title, 'Project Roadmap')
    assert.equal(res.messages.length, 2)
    assert.equal(res.messages[0].content, 'Hello Compass')

    // 3. 404 Not Found returns null without throwing
    globalThis.fetch = async () => new Response('{"detail":"Not found"}', { status: 404 })
    const notFoundRes = await fetchSharedConversation('non_existent_token')
    assert.equal(notFoundRes, null)

    // 4. 500 Server Error returns null without throwing
    globalThis.fetch = async () => new Response('Internal error', { status: 500 })
    const serverErrRes = await fetchSharedConversation('server_error_token')
    assert.equal(serverErrRes, null)

    // 5. Network / connection exception returns null without crashing
    globalThis.fetch = async () => {
      throw new Error('ECONNREFUSED: Server unreachable')
    }
    const netErrRes = await fetchSharedConversation('network_error_token')
    assert.equal(netErrRes, null)

    // 6. Response missing messages array returns null (never returns corrupted/fabricated structure)
    globalThis.fetch = async () => new Response(JSON.stringify({ title: 'No messages' }), { status: 200 })
    const corruptRes = await fetchSharedConversation('token_missing_msgs')
    assert.equal(corruptRes, null)

  } finally {
    globalThis.fetch = originalFetch
  }
})
