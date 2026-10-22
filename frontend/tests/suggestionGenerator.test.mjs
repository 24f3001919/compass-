import { test } from 'node:test'
import assert from 'node:assert'
import {
  generateFollowUpSuggestions,
  isRefusalOrError,
  formatSuggestionText,
} from '../src/utils/suggestionGenerator.js'

test('Empty chat or user message produces no suggestions', () => {
  assert.deepStrictEqual(generateFollowUpSuggestions({ latestMessage: null }), [])
  assert.deepStrictEqual(
    generateFollowUpSuggestions({
      latestMessage: { role: 'user', text: 'Hello' },
      messages: [{ role: 'user', text: 'Hello' }],
    }),
    []
  )
})

test('Error replies or "I don\'t know" / refusal produce no suggestions', () => {
  assert.strictEqual(isRefusalOrError("I don't know the exact schedule"), true)
  assert.strictEqual(isRefusalOrError("I am sorry, but I cannot assist with that"), true)
  assert.strictEqual(isRefusalOrError("Something went wrong"), true)
  assert.strictEqual(isRefusalOrError("Here is the answer", true), true)
  assert.strictEqual(isRefusalOrError("Here is the schedule for Nebius hackathon: Friday 5pm", false), false)

  const errorSuggestions = generateFollowUpSuggestions({
    latestMessage: { role: 'assistant', text: "I don't know the answer to that question.", error: false },
    messages: [
      { role: 'user', text: 'When is the test?' },
      { role: 'assistant', text: "I don't know the answer to that question." },
    ],
  })
  assert.deepStrictEqual(errorSuggestions, [])
})

test('Generates distinct, relevant suggestions for hackathon, code, and coursework topics', () => {
  const hackathonTasks = [
    { id: '1', title: 'Submit Nebius Token Factory Benchmark', domain: 'hackathon', countdown: '2d left' },
  ]
  const hackathonSuggestions = generateFollowUpSuggestions({
    latestMessage: {
      role: 'assistant',
      text: 'The Nebius Token Factory hackathon submission deadline is this Friday at 5 PM on Devpost.',
    },
    messages: [
      { role: 'user', text: 'When is the hackathon deadline on Devpost?' },
      {
        role: 'assistant',
        text: 'The Nebius Token Factory hackathon submission deadline is this Friday at 5 PM on Devpost.',
      },
    ],
    tasks: hackathonTasks,
  })
  assert.ok(hackathonSuggestions.length >= 2 && hackathonSuggestions.length <= 3)
  assert.ok(hackathonSuggestions.includes('Plan the work before the deadline'))
  assert.ok(hackathonSuggestions.includes('Check for schedule conflicts this week'))

  const codeSuggestions = generateFollowUpSuggestions({
    latestMessage: {
      role: 'assistant',
      text: 'We configured 768-dim Matryoshka embeddings with pgvector and HNSW for fast similarity search.',
    },
    messages: [
      { role: 'user', text: 'Why did we choose 768-dim Matryoshka embeddings for pgvector?' },
      {
        role: 'assistant',
        text: 'We configured 768-dim Matryoshka embeddings with pgvector and HNSW for fast similarity search.',
      },
    ],
    tasks: [{ id: '2', title: 'Matryoshka pgvector benchmark', domain: 'code' }],
  })
  assert.ok(codeSuggestions.length >= 2 && codeSuggestions.length <= 3)
  assert.ok(codeSuggestions.includes('What are the tradeoffs?'))

  const courseworkSuggestions = generateFollowUpSuggestions({
    latestMessage: {
      role: 'assistant',
      text: 'For CS 61C, the RISC-V Pipeline Synthesis Report is due Thursday.',
    },
    messages: [
      { role: 'user', text: 'What coursework tasks are due this week?' },
      {
        role: 'assistant',
        text: 'For CS 61C, the RISC-V Pipeline Synthesis Report is due Thursday.',
      },
    ],
    tasks: [{ id: '3', title: 'CS 61C: RISC-V Pipeline Synthesis Report', domain: 'coursework', countdown: '1d left' }],
  })
  assert.ok(courseworkSuggestions.length >= 2 && courseworkSuggestions.length <= 3)
  assert.ok(courseworkSuggestions.includes('Review upcoming coursework deadlines'))
})

test('Never repeats suggestions already asked in the conversation', () => {
  const suggestions = generateFollowUpSuggestions({
    latestMessage: {
      role: 'assistant',
      text: 'We chose Matryoshka embeddings because they allow variable vector truncation with minimal quality loss.',
    },
    messages: [
      { role: 'user', text: 'Why did we choose this approach?' },
      {
        role: 'assistant',
        text: 'We chose Matryoshka embeddings because they allow variable vector truncation with minimal quality loss.',
      },
    ],
  })
  // "Why did we choose this approach?" was already asked, so it MUST NOT be suggested
  assert.strictEqual(suggestions.includes('Why did we choose this approach?'), false)
  assert.ok(suggestions.includes('What are the tradeoffs?'))
})

test('Length limit and formatting: each suggestion <= 60 characters', () => {
  const short = formatSuggestionText('Plan the work before the deadline', 60)
  assert.strictEqual(short, 'Plan the work before the deadline')
  assert.ok(short.length <= 60)

  const long = formatSuggestionText('This is an extremely long suggestion prompt that goes way beyond sixty characters and should be truncated with an ellipsis', 60)
  assert.ok(long.length <= 60)
  assert.ok(long.endsWith('…'))
})

test('Uses API response suggestions when provided', () => {
  const apiSuggestions = ['Custom suggestion A', 'Custom suggestion B']
  const res = generateFollowUpSuggestions({
    latestMessage: {
      role: 'assistant',
      text: 'Here is your summary.',
      suggestions: apiSuggestions,
    },
    messages: [{ role: 'user', text: 'Can you summarize?' }],
  })
  assert.deepStrictEqual(res, apiSuggestions)
})
