import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mapPersonaError } from '../src/utils/personaNotice.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test('mapPersonaError maps 503 db_unavailable, cold_start, rate_limiter_unavailable properly', () => {
  const err503 = { status: 503, code: 'db_unavailable', retryAfter: 8 }
  const res = mapPersonaError(err503)
  assert.equal(res.type, 'info')
  assert.equal(res.text, 'The server is waking up or temporarily unavailable. Retrying...')
  assert.equal(res.canRetry, true)
  assert.equal(res.is503, true)
  assert.equal(res.retryDelay, 8)

  // Cap retryAfter at 10s max
  const errHighDelay = { status: 503, code: 'cold_start', retryAfter: 60 }
  const resHigh = mapPersonaError(errHighDelay)
  assert.equal(resHigh.retryDelay, 10)

  // Rate limiter unavailable
  const errLimiter = { status: 503, code: 'rate_limiter_unavailable' }
  const resLimiter = mapPersonaError(errLimiter)
  assert.equal(resLimiter.is503, true)
  assert.equal(resLimiter.canRetry, true)
  assert.equal(resLimiter.retryDelay, 5)
})

test('mapPersonaError maps 403 seeding_disabled properly', () => {
  const err403 = { status: 403, code: 'seeding_disabled' }
  const res = mapPersonaError(err403)
  assert.equal(res.type, 'disabled')
  assert.equal(res.text, 'Demo loading is turned off on this server.')
  assert.equal(res.canRetry, false)
})

test('mapPersonaError maps 401 session expired properly', () => {
  const err401 = { status: 401, code: 'unauthorized' }
  const res = mapPersonaError(err401)
  assert.equal(res.type, 'error')
  assert.equal(res.text, 'Session expired. Please refresh.')
  assert.equal(res.canRetry, false)
})

test('mapPersonaError maps network error properly', () => {
  const errNet = new Error('Failed to fetch: network connection refused')
  const res = mapPersonaError(errNet)
  assert.equal(res.type, 'error')
  assert.equal(res.text, 'Network error. Check your connection.')
  assert.equal(res.canRetry, true)
})

test('Dashboard.jsx and Timeline.jsx static audit: no alert() in persona seed handler, double-click guard exists', () => {
  const dashPath = path.resolve(__dirname, '../src/components/Dashboard.jsx')
  const dashSrc = fs.readFileSync(dashPath, 'utf8')
  const timelinePath = path.resolve(__dirname, '../src/components/Timeline.jsx')
  const timelineSrc = fs.readFileSync(timelinePath, 'utf8')

  // Check no alert() calls in persona handlers
  const dashSeedHandler = dashSrc.slice(
    dashSrc.indexOf('const handleSeedJudgePersona ='),
    dashSrc.indexOf('const today = useMemo')
  )
  assert.equal(dashSeedHandler.includes('alert('), false, 'Dashboard handleSeedJudgePersona must not call alert()')
  assert.ok(dashSeedHandler.includes('if (seedingPersona && !isRetry) return'), 'Dashboard handleSeedJudgePersona must prevent double clicks')

  const timeSeedHandler = timelineSrc.slice(
    timelineSrc.indexOf('const handleSeedJudgePersona ='),
    timelineSrc.indexOf('const handleDelete =')
  )
  assert.equal(timeSeedHandler.includes('alert('), false, 'Timeline handleSeedJudgePersona must not call alert()')
  assert.ok(timeSeedHandler.includes('if (seedingPersona && !isRetry) return'), 'Timeline handleSeedJudgePersona must prevent double clicks')

  // Check inline dismissible notice banner rendered in both
  assert.ok(dashSrc.includes('role="status"'), 'Dashboard must render accessible status role banner')
  assert.ok(dashSrc.includes('Retry'), 'Dashboard notice must provide Retry button when retryable')
  assert.ok(timelineSrc.includes('role="status"'), 'Timeline must render accessible status role banner')
  assert.ok(timelineSrc.includes('Retry'), 'Timeline notice must provide Retry button when retryable')
})
