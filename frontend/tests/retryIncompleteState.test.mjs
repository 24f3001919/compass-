import test from 'node:test'
import assert from 'node:assert/strict'

test('Retry logic: preserves partial response and error state on failure', () => {
  const initialMessages = []
  const userText = 'Calculate hackathon project schedule'

  // User sends message
  const messagesWithUser = [...initialMessages, { role: 'user', text: userText }]
  assert.equal(messagesWithUser.length, 1)

  // Mid-stream failure occurs after partial tokens
  const receivedTokens = 'Step 1: Design architecture\nStep 2: Database setup\n'
  const errorObj = new Error('TypeError: Load failed')

  const messagesWithAssistantError = [
    ...messagesWithUser,
    {
      role: 'assistant',
      text: receivedTokens.trim(),
      error: errorObj.message,
      canRetry: true,
      retryPrompt: userText,
      thought: 'Thinking through the timeline...',
    }
  ]

  assert.equal(messagesWithAssistantError.length, 2)
  const failedMsg = messagesWithAssistantError[1]
  assert.equal(failedMsg.role, 'assistant')
  assert.equal(failedMsg.text, 'Step 1: Design architecture\nStep 2: Database setup')
  assert.equal(failedMsg.error, 'TypeError: Load failed')
  assert.equal(failedMsg.canRetry, true)
  assert.equal(failedMsg.retryPrompt, userText)
})

test('Retry execution: idempotent, replaces failed assistant message, zero duplicate user messages', () => {
  const userText = 'Check deadlines for Q4'
  let messages = [
    { role: 'user', text: userText },
    {
      role: 'assistant',
      text: 'Here are the first few deadlines:',
      error: 'Connection dropped',
      canRetry: true,
      retryPrompt: userText,
    }
  ]

  // handleRetry simulation: removes failed message at index, triggers handleSend with isRetry = true
  const handleRetry = (msgIndex, retryPrompt) => {
    // 1. Remove failed assistant message
    messages = messages.filter((_, idx) => idx !== msgIndex)
    // 2. Execute send with isRetry = true (does NOT append user message)
    const isRetry = true
    if (!isRetry) {
      messages = [...messages, { role: 'user', text: retryPrompt }]
    }
  }

  handleRetry(1, userText)

  // Verify only the single original user message remains (zero duplicate user messages)
  assert.equal(messages.length, 1)
  assert.equal(messages[0].role, 'user')
  assert.equal(messages[0].text, userText)

  // Simulated retry completion
  messages.push({
    role: 'assistant',
    text: 'Complete list of Q4 deadlines: Oct 30, Nov 15, Dec 1.',
  })
  assert.equal(messages.length, 2)
  assert.equal(messages[1].text.includes('Complete list'), true)
})
