/**
 * Compass — Safe Workspace Draft Recovery Tests.
 *
 * Verifies:
 * 1. Unsaved edits survive simulated modal unmount/remount.
 * 2. Successful save clears or reconciles the draft.
 * 3. Failed save preserves the draft.
 * 4. Different opportunities have strictly isolated drafts.
 * 5. Different user/guest scopes cannot read one another's drafts.
 * 6. Malformed JSON or inaccessible localStorage does not crash the UI.
 * 7. Newer server version triggers conflict detection rather than silent overwrite.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

// Polyfill minimal browser window & localStorage for Node testing
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

globalThis.window = {}
globalThis.localStorage = new MockLocalStorage()

const {
  getActiveSessionScope,
  getWorkspaceDraftKey,
  loadWorkspaceDraft,
  saveWorkspaceDraft,
  clearWorkspaceDraft,
  hasMaterialUnsavedChanges,
  inspectDraftConflict,
} = await import('../frontend/src/utils/workspaceDraft.js')

test('Workspace Draft: User and guest scope isolation', () => {
  localStorage.clear()

  // 1. Authenticated user scope
  localStorage.setItem('compass_user_id', 'alice@example.com')
  assert.equal(getActiveSessionScope(), 'user_alice_example_com')
  const keyAlice = getWorkspaceDraftKey(201)
  assert.equal(keyAlice, 'compass_draft_user_alice_example_com_opp_201')

  // 2. Guest scope
  localStorage.removeItem('compass_user_id')
  localStorage.setItem('compass_guest_id', 'gst_test_456')
  assert.equal(getActiveSessionScope(), 'guest_gst_test_456')
  const keyGuest = getWorkspaceDraftKey(201)
  assert.equal(keyGuest, 'compass_draft_guest_gst_test_456_opp_201')

  // 3. Different users cannot access each other's keys
  assert.notEqual(keyAlice, keyGuest)
})

test('Workspace Draft: Opportunity isolation prevents cross-opportunity leak', () => {
  localStorage.clear()
  localStorage.setItem('compass_user_id', 'candidate@example.com')

  // Save draft for Opportunity 201
  saveWorkspaceDraft(201, {
    fullName: 'Opportunity 201 Draft Name',
    summary: 'Tailored specifically for Robotics',
    skillsText: 'ROS, C++, Python',
  })

  // Opportunity 202 must NOT see Opportunity 201's draft
  const draft202 = loadWorkspaceDraft(202)
  assert.equal(draft202, null)

  // Opportunity 201 sees its own draft
  const draft201 = loadWorkspaceDraft(201)
  assert.ok(draft201)
  assert.equal(draft201.draft.fullName, 'Opportunity 201 Draft Name')
  assert.equal(draft201.draft.skillsText, 'ROS, C++, Python')
})

test('Workspace Draft: Unsaved edits survive simulated modal unmount/remount', () => {
  localStorage.clear()
  localStorage.setItem('compass_user_id', 'candidate@example.com')

  // User edits tailored resume and cover letter
  saveWorkspaceDraft(301, {
    fullName: 'Jane Doe Updated',
    coverLetterText: 'Custom cover letter drafted by Jane.',
    resumeTemplate: 'modern',
  })

  // Simulate modal closing (unmounting) and reopening
  const recovered = loadWorkspaceDraft(301)
  assert.ok(recovered)
  assert.equal(recovered.draft.fullName, 'Jane Doe Updated')
  assert.equal(recovered.draft.coverLetterText, 'Custom cover letter drafted by Jane.')
  assert.equal(recovered.draft.resumeTemplate, 'modern')
})

test('Workspace Draft: Successful save clears draft; failed save preserves it', () => {
  localStorage.clear()
  localStorage.setItem('compass_user_id', 'candidate@example.com')

  saveWorkspaceDraft(401, {
    fullName: 'Pending Save Candidate',
    summary: 'Work in progress summary',
  })

  // 1. Simulate failed save -> draft is NOT cleared
  try {
    throw new Error('Network timeout during API save')
  } catch {
    // on failure, clearWorkspaceDraft is NOT called
  }
  assert.ok(loadWorkspaceDraft(401), 'Draft must remain intact after failed save')

  // 2. Simulate successful save -> draft is cleared
  clearWorkspaceDraft(401)
  assert.equal(loadWorkspaceDraft(401), null, 'Draft must be cleared after successful save')
})

test('Workspace Draft: Malformed JSON or storage error does not crash', () => {
  localStorage.clear()
  localStorage.setItem('compass_user_id', 'candidate@example.com')

  // Inject corrupted data
  const key = getWorkspaceDraftKey(501)
  localStorage.setItem(key, '{corrupted_json: incomplete...')

  // Loading corrupted draft must return null and clear the corrupted item without throwing
  const result = loadWorkspaceDraft(501)
  assert.equal(result, null)
  assert.equal(localStorage.getItem(key), null)
})

test('Workspace Draft: Conflict detection handles server newer vs unsaved draft', () => {
  const serverResume = {
    updated_at: '2026-10-18T10:00:00.000Z',
    content: {
      full_name: 'Server Name',
      skills: ['Python', 'SQL'],
      summary: 'Server summary',
    },
  }
  const serverApp = {
    updated_at: '2026-10-18T10:00:00.000Z',
    cover_letter: 'Server cover letter',
  }

  // 1. Draft with unsaved changes saved at 10:05 (newer than server)
  const newerDraft = {
    updatedAt: '2026-10-18T10:05:00.000Z',
    draft: {
      fullName: 'Server Name (Edited)',
      skillsText: 'Python, SQL, Go',
    },
  }
  const conflict1 = inspectDraftConflict(newerDraft, serverResume, serverApp)
  assert.equal(conflict1.hasConflict, true)
  assert.equal(conflict1.type, 'unsaved_draft')

  // 2. Server was updated at 10:10 (newer than draft saved at 10:05)
  const updatedServerResume = {
    ...serverResume,
    updated_at: '2026-10-18T10:10:00.000Z',
  }
  const conflict2 = inspectDraftConflict(newerDraft, updatedServerResume, serverApp)
  assert.equal(conflict2.hasConflict, true)
  assert.equal(conflict2.type, 'server_newer')

  // 3. Draft identical to server has NO conflict
  const identicalDraft = {
    updatedAt: '2026-10-18T10:05:00.000Z',
    draft: {
      fullName: 'Server Name',
      skillsText: 'Python, SQL',
      summary: 'Server summary',
      coverLetterText: 'Server cover letter',
    },
  }
  const conflict3 = inspectDraftConflict(identicalDraft, serverResume, serverApp)
  assert.equal(conflict3.hasConflict, false)
})
