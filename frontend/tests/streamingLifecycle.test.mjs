import test from 'node:test'
import assert from 'node:assert/strict'

// Polyfill import.meta.env and browser globals for Node test environment
if (!globalThis.import) {
  globalThis.import = { meta: { env: {} } }
}

if (!globalThis.localStorage) {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  }
}

import { streamQueryFromAssistant } from '../src/api/chatApi.js'

function makeMockResponse(chunks) {
  const encoder = new TextEncoder()
  let index = 0

  const stream = new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index++]))
      } else {
        controller.close()
      }
    }
  })

  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    body: stream,
  }
}

test('SSE Client: Text accumulates incrementally across multiple chunks', async () => {
  const sseData = [
    'data: {"type": "token", "value": "Hello"}\n\n',
    'data: {"type": "token", "value": " world"}\n\n',
    'data: {"type": "token", "value": "!"}\n\n',
    'data: {"type": "done", "conversation_id": "c1", "skill_used": "chat"}\n\n',
  ]

  globalThis.fetch = async () => makeMockResponse(sseData)

  const tokensReceived = []
  let completedData = null

  await streamQueryFromAssistant('hi', 'c1', {
    onToken: (chunk, full) => {
      tokensReceived.push({ chunk, full })
    },
    onComplete: (data) => {
      completedData = data
    }
  })

  assert.equal(tokensReceived.length, 3)
  assert.equal(tokensReceived[2].full, 'Hello world!')
  assert.ok(completedData)
  assert.equal(completedData.response, 'Hello world!')
  assert.equal(completedData.conversation_id, 'c1')
})

test('SSE Client: Handles CRLF and arbitrary chunk boundaries', async () => {
  // Split frames across unusual packet boundaries with \r\n
  const sseData = [
    'data: {"type": "to',
    'ken", "value": "Part1"}\r\n\r\ndata: {"type": "token", "val',
    'ue": "Part2"}\r\n\r\ndata: {"type": "done", "conversation_id": "c2"}\r\n\r\n',
  ]

  globalThis.fetch = async () => makeMockResponse(sseData)

  let finalFull = ''
  let completed = false

  await streamQueryFromAssistant('test boundary', 'c2', {
    onToken: (_tok, full) => { finalFull = full },
    onComplete: () => { completed = true }
  })

  assert.equal(finalFull, 'Part1Part2')
  assert.equal(completed, true)
})

test('SSE Client: Tool replacement event cleanly replaces leaked markup', async () => {
  const sseData = [
    'data: {"type": "token", "value": "<calling tool>"}\n\n',
    'data: {"type": "replace", "value": "Clean synthesized answer"}\n\n',
    'data: {"type": "done", "conversation_id": "c3"}\n\n',
  ]

  globalThis.fetch = async () => makeMockResponse(sseData)

  let latest = ''
  await streamQueryFromAssistant('use tool', 'c3', {
    onToken: (_tok, full) => { latest = full },
  })

  assert.equal(latest, 'Clean synthesized answer')
})

test('SSE Client: Preserves partial output and records partialResponse when stream fails', async () => {
  const encoder = new TextEncoder()
  let step = 0
  const stream = new ReadableStream({
    pull(controller) {
      if (step === 0) {
        controller.enqueue(encoder.encode('data: {"type": "token", "value": "Crucial partial knowledge"}\n\n'))
        step++
      } else {
        controller.error(new Error('Network connection dropped by peer'))
      }
    }
  })

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    body: stream,
  })

  let capturedError = null
  let receivedTokens = ''

  await streamQueryFromAssistant('query', 'c4', {
    onToken: (_tok, full) => { receivedTokens = full },
    onError: (err) => {
      capturedError = err
    }
  })

  assert.ok(capturedError)
  assert.equal(receivedTokens, 'Crucial partial knowledge')
  assert.equal(capturedError.partialResponse, 'Crucial partial knowledge')
})

test('SSE Client: Cleanly handles AbortController cancellation', async () => {
  const controller = new AbortController()

  globalThis.fetch = async (_url, options) => {
    return new Promise((_, reject) => {
      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          const abortErr = new Error('The operation was aborted')
          abortErr.name = 'AbortError'
          reject(abortErr)
        })
      }
    })
  }

  setTimeout(() => controller.abort(), 20)

  let capturedErr = null
  await streamQueryFromAssistant('abort test', 'c5', {
    signal: controller.signal,
    onError: (err) => { capturedErr = err },
  })

  assert.ok(capturedErr)
  assert.equal(capturedErr.name, 'AbortError')
})

test('SSE Client: Handles malformed and incomplete frames gracefully', async () => {
  const sseData = [
    ': ping\n\n',
    'garbage non-data line\n\n',
    'data: not-json\n\n',
    'data: {"type": "token", "value": "Valid chunk"}\n\n',
    'data: {"type": "done", "conversation_id": "c6"}\n\n',
  ]

  globalThis.fetch = async () => makeMockResponse(sseData)

  let finalFull = ''
  let completed = false

  await streamQueryFromAssistant('parse test', 'c6', {
    onToken: (_tok, full) => { finalFull = full },
    onComplete: () => { completed = true },
  })

  assert.equal(finalFull, 'Valid chunk')
  assert.equal(completed, true)
})

test('SSE Client: Backend error event throws with can_retry and preserves partial output', async () => {
  const sseData = [
    'data: {"type": "token", "value": "Good prefix"}\n\n',
    'data: {"type": "error", "detail": "Model context exceeded", "can_retry": true}\n\n',
  ]

  globalThis.fetch = async () => makeMockResponse(sseData)

  let capturedErr = null
  let receivedTokens = ''

  await streamQueryFromAssistant('err test', 'c7', {
    onToken: (_tok, full) => { receivedTokens = full },
    onError: (err) => { capturedErr = err },
  })

  assert.ok(capturedErr)
  assert.equal(capturedErr.message, 'Model context exceeded')
  assert.equal(capturedErr.can_retry, true)
  assert.equal(capturedErr.partialResponse, 'Good prefix')
  assert.equal(receivedTokens, 'Good prefix')
})

