import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test('App.jsx static audit: App mount hook never invokes clearDemoPersona or demo/clear', () => {
  const appPath = path.resolve(__dirname, '../src/App.jsx')
  const appSource = fs.readFileSync(appPath, 'utf8')

  // Check that clearDemoPersona() is not invoked in any useEffect
  const hasMountClear = /useEffect\s*\(\s*\(\)\s*=>\s*\{[^}]*clearDemoPersona/m.test(appSource)
  assert.equal(
    hasMountClear,
    false,
    'App.jsx must NOT call clearDemoPersona() inside any mount useEffect hook'
  )

  // Check that demo/clear and demo/seed are not invoked anywhere in App.jsx
  assert.equal(
    appSource.includes('/demo/clear'),
    false,
    'App.jsx must not contain /demo/clear API endpoints'
  )
  assert.equal(
    appSource.includes('/demo/seed'),
    false,
    'App.jsx must not contain /demo/seed API endpoints'
  )
})

test('Mount lifecycle network audit: initial application startup sends no /demo/clear and no /demo/seed', async () => {
  const originalFetch = globalThis.fetch
  const networkCalls = []

  globalThis.fetch = async (url, options = {}) => {
    networkCalls.push({ url: String(url), method: options.method || 'GET' })
    if (String(url).includes('/health')) {
      return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
    }
    if (String(url).includes('/tasks')) {
      return { ok: true, status: 200, json: async () => [] }
    }
    if (String(url).includes('/usage')) {
      return { ok: true, status: 200, json: async () => ({ total_requests: 0 }) }
    }
    if (String(url).includes('/auth/me')) {
      return { ok: true, status: 200, json: async () => ({ authenticated: false }) }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  }

  try {
    const { checkBackendHealth, fetchTasks, fetchUsageSummary, fetchCurrentUser } = await import('../src/api/client.js')
    
    // Simulate typical initial mount API sequence triggered when App mounts
    await Promise.all([
      checkBackendHealth().catch(() => {}),
      fetchTasks('all').catch(() => {}),
      fetchUsageSummary().catch(() => {}),
      fetchCurrentUser().catch(() => {}),
    ])

    const clearCalls = networkCalls.filter(c => c.url.includes('/demo/clear') || c.url.includes('demo/clear'))
    const seedCalls = networkCalls.filter(c => c.url.includes('/demo/seed') || c.url.includes('demo/seed'))

    assert.equal(clearCalls.length, 0, `Mount sequence sent ${clearCalls.length} /demo/clear calls: ${JSON.stringify(clearCalls)}`)
    assert.equal(seedCalls.length, 0, `Mount sequence sent ${seedCalls.length} /demo/seed calls: ${JSON.stringify(seedCalls)}`)
  } finally {
    globalThis.fetch = originalFetch
  }
})
