import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseUsageBadge } from '../src/utils/usageBadgeParser.js'

test('parseUsageBadge formats calls with thousands separators and extracts full cost', () => {
  // Standard format
  const res1 = parseUsageBadge('⚡ 2385 calls · $1.43777')
  assert.equal(res1.isUsage, true)
  assert.equal(res1.calls, '2,385 calls')
  assert.equal(res1.cost, '$1.43777')
  assert.equal(res1.fullText, '2,385 calls · $1.43777')

  // Zero calls
  const res2 = parseUsageBadge('⚡ 0 calls · $0.00000')
  assert.equal(res2.isUsage, true)
  assert.equal(res2.calls, '0 calls')
  assert.equal(res2.cost, '$0.00000')

  // 5-digit call counts and larger cost
  const res3 = parseUsageBadge('⚡ 15420 calls · $12.34567')
  assert.equal(res3.isUsage, true)
  assert.equal(res3.calls, '15,420 calls')
  assert.equal(res3.cost, '$12.34567')

  // Already formatted string
  const res4 = parseUsageBadge('⚡ 2,385 calls · $1.43777')
  assert.equal(res4.isUsage, true)
  assert.equal(res4.calls, '2,385 calls')
  assert.equal(res4.cost, '$1.43777')

  // Fallback text
  const res5 = parseUsageBadge('Nebius • Nemotron-3')
  assert.equal(res5.isUsage, false)
  assert.equal(res5.text, 'Nebius • Nemotron-3')

  // Null/undefined/empty
  assert.equal(parseUsageBadge(null), null)
  assert.equal(parseUsageBadge(''), null)
})
