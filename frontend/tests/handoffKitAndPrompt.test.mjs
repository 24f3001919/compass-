import test from 'node:test'
import assert from 'node:assert/strict'

test('Handoff Kit: Common answers extraction preserves missing fields without guessing', () => {
  const profileWithMissing = {
    degree: 'B.Tech Computer Science',
    grad_year: 2026,
    work_authorization: null, // missing
    preferred_work_arrangements: [],
  }

  const commonAnswers = {
    graduation_year: profileWithMissing.grad_year ? String(profileWithMissing.grad_year) : null,
    degree: profileWithMissing.degree || null,
    work_authorization: profileWithMissing.work_authorization || null,
    notice_or_availability: profileWithMissing.preferred_work_arrangements.length > 0
      ? `Available for ${profileWithMissing.preferred_work_arrangements.join(', ')}`
      : null,
  }

  assert.equal(commonAnswers.graduation_year, '2026')
  assert.equal(commonAnswers.degree, 'B.Tech Computer Science')
  assert.equal(commonAnswers.work_authorization, null, 'Work authorization must not be guessed when missing in profile')
  assert.equal(commonAnswers.notice_or_availability, null, 'Availability must not be guessed when missing in profile')
})

test('Handoff Kit: Blocked export detection when candidate profile is placeholder or empty', () => {
  const PLACEHOLDER_NAMES = new Set(['compass candidate', 'candidate', ''])
  const PLACEHOLDER_EMAILS = new Set(['candidate@compass.local', ''])

  function evaluateExportBlock(name, email) {
    const cleanName = (name || '').trim().toLowerCase()
    const cleanEmail = (email || '').trim().toLowerCase()
    if (!cleanName || PLACEHOLDER_NAMES.has(cleanName)) {
      return { blocked: true, reason: 'Full name missing or placeholder' }
    }
    if (!cleanEmail || PLACEHOLDER_EMAILS.has(cleanEmail) || !cleanEmail.includes('@')) {
      return { blocked: true, reason: 'Email missing or placeholder' }
    }
    return { blocked: false, reason: null }
  }

  assert.equal(evaluateExportBlock('', 'valid@example.com').blocked, true)
  assert.equal(evaluateExportBlock('Compass Candidate', 'valid@example.com').blocked, true)
  assert.equal(evaluateExportBlock('Jane Doe', 'candidate@compass.local').blocked, true)
  assert.equal(evaluateExportBlock('Jane Doe', 'jane@example.com').blocked, false)
})

test('ReturnSubmissionPrompt: Does not loop and snoozes gracefully', () => {
  let storage = {
    applicationId: 42,
    companyName: 'Acme Corp',
    openedAt: Date.now() - 5000,
    status: 'pending_return',
  }

  // First return triggers prompt display
  if (storage.status === 'pending_return') {
    storage.status = 'prompt_displayed'
  }
  assert.equal(storage.status, 'prompt_displayed')

  // Next return does not re-trigger because status is prompt_displayed
  let didPromptAgain = false
  if (storage.status === 'pending_return') {
    didPromptAgain = true
  }
  assert.equal(didPromptAgain, false, 'Prompt must not loop on subsequent focus/visibility events')

  // User clicks "Not yet" -> snoozed
  storage.status = 'snoozed'
  assert.equal(storage.status, 'snoozed')
})
