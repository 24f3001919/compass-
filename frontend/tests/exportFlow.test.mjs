import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  downloadAuthedFile,
  openAuthedHtml,
  mapHttpErrorToUserMessage,
  setGuestSession,
} from '../src/api/baseClient.js'
import {
  getResumeExportUrl,
  getResumeExportDocxUrl,
} from '../src/api/careerApi.js'
import { getCalendarExportUrl } from '../src/api/calendarApi.js'

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => ({
      style: {},
      click: () => {},
      parentNode: { removeChild: () => {} },
    }),
    body: {
      appendChild: () => {},
      removeChild: () => {},
    },
  }
}

test('export url helpers: do not leak tokens in query strings', () => {
  setGuestSession('guest-123', 'token-secret-abc')

  const htmlUrl = getResumeExportUrl(7, 'ats_classic')
  assert.ok(htmlUrl.includes('/resumes/7/export/html?template=ats_classic'))
  assert.ok(!htmlUrl.includes('guest_token='))
  assert.ok(!htmlUrl.includes('token='))

  const docxUrl = getResumeExportDocxUrl(7)
  assert.ok(docxUrl.includes('/resumes/7/export/docx'))
  assert.ok(!docxUrl.includes('guest_token='))
  assert.ok(!docxUrl.includes('token='))
})

test('mapHttpErrorToUserMessage: maps HTTP status codes to user-friendly messages', () => {
  assert.equal(
    mapHttpErrorToUserMessage(401),
    'Your session has expired. Please sign in or refresh the page.'
  )
  assert.equal(
    mapHttpErrorToUserMessage(403),
    'The requested resource was not found or you do not have permission to access it.'
  )
  assert.equal(
    mapHttpErrorToUserMessage(404),
    'The requested resource was not found or you do not have permission to access it.'
  )
  assert.equal(
    mapHttpErrorToUserMessage(500),
    'The server encountered an error generating the file. Please try again later.'
  )
  assert.equal(
    mapHttpErrorToUserMessage(502),
    'The server encountered an error generating the file. Please try again later.'
  )
  assert.equal(
    mapHttpErrorToUserMessage(418, 'Custom fallback'),
    'Custom fallback'
  )
})

test('downloadAuthedFile: sends auth headers and uses Content-Disposition filename', async () => {
  const originalFetch = globalThis.fetch
  const originalCreate = globalThis.URL.createObjectURL
  const originalRevoke = globalThis.URL.revokeObjectURL

  let capturedHeaders = {}
  let revokedUrls = []
  let createdBlob = null

  // Mock guest token
  setGuestSession('guest-123', 'guest-token-xyz-123')

  globalThis.URL.createObjectURL = (blob) => {
    createdBlob = blob
    return 'blob:mock-url-123'
  }
  globalThis.URL.revokeObjectURL = (url) => {
    revokedUrls.push(url)
  }

  globalThis.fetch = async (url, options = {}) => {
    capturedHeaders = options.headers || {}
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: {
        'content-disposition': 'attachment; filename="Test_Candidate_Resume.docx"',
        'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    })
  }

  try {
    const res = await downloadAuthedFile('http://localhost:8000/api/career/resumes/7/export/docx')
    assert.equal(res.success, true)
    assert.equal(res.filename, 'Test_Candidate_Resume.docx')
    assert.equal(capturedHeaders['x-guest-token'], 'guest-token-xyz-123')
    assert.ok(createdBlob instanceof Blob)
  } finally {
    globalThis.fetch = originalFetch
    globalThis.URL.createObjectURL = originalCreate
    globalThis.URL.revokeObjectURL = originalRevoke
  }
})

test('downloadAuthedFile: handles 401 and 404 errors with friendly messages and no JSON dump', async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = async (url) => {
    if (String(url).includes('/api/guest/session')) {
      return new Response(JSON.stringify({ guest_id: 'guest-123', guest_token: 'new-guest-token' }), { status: 200 })
    }
    return new Response(JSON.stringify({ detail: 'Authentication or valid guest token required' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    await assert.rejects(
      async () => {
        await downloadAuthedFile('http://localhost:8000/api/career/resumes/7/export/docx')
      },
      (err) => {
        assert.equal(err.status, 401)
        assert.equal(err.message, 'Your session has expired. Please sign in or refresh the page.')
        assert.ok(!err.message.includes('{"detail"'))
        return true
      }
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('openAuthedHtml: fetches HTML with auth headers and navigates popup to blob URL instead of raw API', async () => {
  const originalFetch = globalThis.fetch
  const originalCreate = globalThis.URL.createObjectURL
  const originalRevoke = globalThis.URL.revokeObjectURL

  let capturedHeaders = {}
  let popupNavigatedTo = null
  let printCalled = false

  setGuestSession('guest-123', 'guest-token-xyz-123')

  globalThis.URL.createObjectURL = () => 'blob:http://localhost:5173/mock-resume-html'
  globalThis.URL.revokeObjectURL = () => {}

  const mockPopup = {
    closed: false,
    location: {
      set href(val) {
        popupNavigatedTo = val
      },
      get href() {
        return popupNavigatedTo
      },
    },
    close: () => {},
    focus: () => {},
    print: () => {
      printCalled = true
    },
  }

  globalThis.fetch = async (url, options = {}) => {
    capturedHeaders = options.headers || {}
    return new Response('<!DOCTYPE html><html><body><h1>Compass Candidate</h1></body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })
  }

  try {
    const res = await openAuthedHtml('http://localhost:8000/api/career/resumes/7/export/html?template=ats_classic', {
      printOnLoad: true,
      popup: mockPopup,
    })
    assert.equal(res.success, true)
    assert.equal(capturedHeaders['x-guest-token'], 'guest-token-xyz-123')
    assert.equal(popupNavigatedTo, 'blob:http://localhost:5173/mock-resume-html')
    // Trigger onload to verify print execution
    if (mockPopup.onload) mockPopup.onload()
    assert.equal(printCalled, true)
  } finally {
    globalThis.fetch = originalFetch
    globalThis.URL.createObjectURL = originalCreate
    globalThis.URL.revokeObjectURL = originalRevoke
  }
})

test('downloadAuthedFile: supports calendar .ics download with proper headers and filename', async () => {
  const originalFetch = globalThis.fetch
  const originalCreate = globalThis.URL.createObjectURL
  const originalRevoke = globalThis.URL.revokeObjectURL

  let capturedHeaders = {}
  let createdBlob = null

  setGuestSession('guest-calendar-123', 'guest-token-cal-456')

  globalThis.URL.createObjectURL = (blob) => {
    createdBlob = blob
    return 'blob:mock-ics-url'
  }
  globalThis.URL.revokeObjectURL = () => {}

  globalThis.fetch = async (url, options = {}) => {
    capturedHeaders = options.headers || {}
    return new Response('BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Compass//Calendar//EN\nEND:VCALENDAR', {
      status: 200,
      headers: {
        'content-disposition': 'attachment; filename="compass_schedule.ics"',
        'content-type': 'text/calendar; charset=utf-8',
      },
    })
  }

  try {
    const icsUrl = getCalendarExportUrl()
    assert.ok(icsUrl.includes('/calendar/export.ics'))
    assert.ok(!icsUrl.includes('guest_token='))

    const res = await downloadAuthedFile(icsUrl)
    assert.equal(res.success, true)
    assert.equal(res.filename, 'compass_schedule.ics')
    assert.equal(capturedHeaders['x-guest-token'], 'guest-token-cal-456')
    assert.ok(createdBlob instanceof Blob)
  } finally {
    globalThis.fetch = originalFetch
    globalThis.URL.createObjectURL = originalCreate
    globalThis.URL.revokeObjectURL = originalRevoke
  }
})

