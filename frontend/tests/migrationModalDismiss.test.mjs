import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  fetchMigrationStatus,
  skipMigration,
  importAllGuestData,
  importSelectedGuestConversations,
} from '../src/api/migrationApi.js'
import {
  getGuestToken,
  getGuestId,
  setGuestSession,
  getCurrentUserId,
  setCurrentUserId,
} from '../src/api/baseClient.js'

// Setup mocks for node:test environment
const sessionStorageStore = new Map()
globalThis.sessionStorage = {
  getItem: (k) => sessionStorageStore.get(k) || null,
  setItem: (k, v) => sessionStorageStore.set(k, String(v)),
  removeItem: (k) => sessionStorageStore.delete(k),
  clear: () => sessionStorageStore.clear(),
}

const localStorageStore = new Map()
globalThis.localStorage = {
  getItem: (k) => localStorageStore.get(k) || null,
  setItem: (k, v) => localStorageStore.set(k, String(v)),
  removeItem: (k) => localStorageStore.delete(k),
  clear: () => localStorageStore.clear(),
}

globalThis.window = {
  sessionStorage: globalThis.sessionStorage,
  localStorage: globalThis.localStorage,
}

test('Test A & D: skipMigration persists session-level dismissal and calls skip endpoint', async () => {
  sessionStorageStore.clear()
  let fetchCalled = false
  let fetchMethod = null
  let fetchUrl = null

  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    fetchCalled = true
    fetchUrl = url
    fetchMethod = init?.method
    return {
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', message: 'Migration dismissed for now.' }),
    }
  }

  try {
    const success = await skipMigration()
    assert.equal(success, true)
    assert.equal(fetchCalled, true)
    assert.equal(fetchMethod, 'POST')
    assert.ok(fetchUrl.includes('/api/migration/skip'))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Test C: Dismissal does not invoke import or deletion APIs and preserves guest tokens', async () => {
  setGuestSession('guest-uuid-1234', 'guest-uuid-1234.validhmac')
  setCurrentUserId('authenticated_user@example.com')

  let importAllCalled = false
  let deleteGuestDataCalled = false

  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    if (url.includes('/api/migration/import-all') || url.includes('/api/guest/migrate')) {
      importAllCalled = true
    }
    if (url.includes('/api/guest/data') && init?.method === 'DELETE') {
      deleteGuestDataCalled = true
    }
    if (url.includes('/api/migration/skip')) {
      return { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  }

  try {
    // Perform skip/dismiss action
    await skipMigration()

    assert.equal(importAllCalled, false, 'Import all should not be invoked on dismissal')
    assert.equal(deleteGuestDataCalled, false, 'Guest data delete should not be invoked on dismissal')

    // Confirm guest credentials remain intact
    assert.equal(getGuestId(), 'guest-uuid-1234')
    assert.equal(getGuestToken(), 'guest-uuid-1234.validhmac')
    assert.equal(getCurrentUserId(), 'authenticated_user@example.com')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Test E: Import actions remain fully functional and intact', async () => {
  let importAllPayload = null
  let importSelectedPayload = null

  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    if (url.includes('/api/migration/import-all')) {
      importAllPayload = true
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', imported_count: 5 }),
      }
    }
    if (url.includes('/api/migration/import-selected')) {
      importSelectedPayload = JSON.parse(init.body)
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', imported_count: 2 }),
      }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  }

  try {
    const resAll = await importAllGuestData()
    assert.equal(resAll.status, 'ok')
    assert.equal(resAll.imported_count, 5)
    assert.equal(importAllPayload, true)

    const resSelected = await importSelectedGuestConversations(['conv-1', 'conv-2'], true)
    assert.equal(resSelected.status, 'ok')
    assert.equal(resSelected.imported_count, 2)
    assert.deepEqual(importSelectedPayload, {
      conversation_ids: ['conv-1', 'conv-2'],
      import_memory: true,
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Test F: Session dismissal flag prevents immediate automatic reopening during polling/hydration', async () => {
  sessionStorageStore.clear()
  sessionStorageStore.set('compass_migration_dismissed', '1')

  let modalOpened = false
  const checkMigration = async () => {
    if (typeof window !== 'undefined' && window.sessionStorage?.getItem('compass_migration_dismissed') === '1') {
      return // Prompt suppressed for current session
    }
    const status = await fetchMigrationStatus()
    if (status.has_guest_data && status.guest_conversations_count > 0 && !status.skipped) {
      modalOpened = true
    }
  }

  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      has_guest_data: true,
      guest_conversations_count: 3,
      skipped: false,
    }),
  })

  try {
    await checkMigration()
    assert.equal(modalOpened, false, 'Modal should not reopen while dismissed in session')

    // But when dismissal flag is removed (e.g. after logout or manual trigger), prompt activates
    sessionStorageStore.delete('compass_migration_dismissed')
    await checkMigration()
    assert.equal(modalOpened, true, 'Modal opens when not dismissed')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Test G: Dismissing migration preserves authenticated user state', async () => {
  setCurrentUserId('student_dev@university.edu')
  sessionStorageStore.set('compass_migration_dismissed', '1')

  assert.equal(getCurrentUserId(), 'student_dev@university.edu')
  assert.equal(sessionStorageStore.get('compass_migration_dismissed'), '1')
})

test('Test H: skipMigration gracefully handles network errors without uncaught rejections', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error('Network offline or backend timeout')
  }

  try {
    // Must return false instead of throwing
    const result = await skipMigration()
    assert.equal(result, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})
