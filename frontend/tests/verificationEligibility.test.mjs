import test from 'node:test'
import assert from 'node:assert/strict'

import { isMessageEligibleForVerification } from '../src/utils/verificationEligibility.js'

test('Initial Compass greeting is HIDDEN from verification', () => {
  const initialGreeting = {
    id: 'msg-init-1',
    role: 'assistant',
    text: "Hey! I'm Compass. I can track tasks, recall code context, synthesize cross-domain roadmaps, and search the web. What's on your mind?",
  }
  assert.equal(isMessageEligibleForVerification(initialGreeting), false)
  // Raw string equivalent
  assert.equal(isMessageEligibleForVerification(initialGreeting.text), false)
})

test('Ordinary conversational greetings are HIDDEN from verification', () => {
  const greetings = [
    "Hello! How can I help you today?",
    "Hey there! What are you working on right now?",
    "Good morning! Ready when you are.",
    "Hi! Welcome back.",
  ]
  for (const text of greetings) {
    assert.equal(
      isMessageEligibleForVerification({ role: 'assistant', text }),
      false,
      `Expected greeting "${text}" to be hidden`
    )
  }
})

test('Acknowledgements, thanks, and pleasantries are HIDDEN from verification', () => {
  const acknowledgements = [
    "Thanks! Let me know if you need anything else.",
    "You're welcome! Glad I could help with your schedule.",
    "Got it. I'll make sure to note that in your preferences.",
    "No problem at all! Feel free to ask if you have any questions.",
    "Sure thing! Happy to assist.",
  ]
  for (const text of acknowledgements) {
    assert.equal(
      isMessageEligibleForVerification({ role: 'assistant', text }),
      false,
      `Expected acknowledgement "${text}" to be hidden`
    )
  }
})

test('Successful task creation confirmations are HIDDEN from verification', () => {
  const taskMessages = [
    "I've created your task successfully.",
    "Task 'Review calculus notes' created and added to your timeline.",
    "Task marked as complete! Great job staying on track.",
    "I've deleted the task from your schedule.",
    "Here are your current active tasks for today.",
  ]
  for (const text of taskMessages) {
    assert.equal(
      isMessageEligibleForVerification({ role: 'assistant', text }),
      false,
      `Expected task confirmation "${text}" to be hidden`
    )
  }
})

test('Simple code-generation responses are HIDDEN by default', () => {
  const codeResponses = [
    "Here's a Java implementation of binary search:\n```java\npublic class BinarySearch {\n    public static int search(int[] arr, int target) {\n        return -1;\n    }\n}\n```",
    "Here is a Python function to reverse a string:\n```python\ndef reverse_str(s):\n    return s[::-1]\n```",
    "Here is the implementation of a quicksort algorithm in C++.",
  ]
  for (const text of codeResponses) {
    assert.equal(
      isMessageEligibleForVerification({ role: 'assistant', text }),
      false,
      `Expected code snippet "${text.slice(0, 40)}" to be hidden`
    )
  }
})

test('Specific hackathon deadline claim is VISIBLE for verification', () => {
  const hackathonMsg = {
    id: 'msg-hackathon-1',
    role: 'assistant',
    text: "The Nebius x NVIDIA Global AI Hackathon submission deadline is October 30.",
  }
  assert.equal(isMessageEligibleForVerification(hackathonMsg), true)

  const altHackathon = {
    id: 'msg-hackathon-2',
    role: 'assistant',
    text: "Registration for the upcoming AI competition closes on December 15, with submissions due by midnight.",
  }
  assert.equal(isMessageEligibleForVerification(altHackathon), true)
})

test('Specific internship application deadline claim is VISIBLE for verification', () => {
  const internshipMsg = {
    id: 'msg-internship-1',
    role: 'assistant',
    text: "Applications for this internship close on November 5.",
  }
  assert.equal(isMessageEligibleForVerification(internshipMsg), true)

  const altInternship = {
    id: 'msg-internship-2',
    role: 'assistant',
    text: "The software engineering summer internship application deadline is January 15.",
  }
  assert.equal(isMessageEligibleForVerification(altInternship), true)
})

test('Current policy or official announcement claim is VISIBLE for verification', () => {
  const policyMsg = {
    id: 'msg-policy-1',
    role: 'assistant',
    text: "The new company policy requires all submissions by Friday.",
  }
  assert.equal(isMessageEligibleForVerification(policyMsg), true)

  const announcementMsg = {
    id: 'msg-announcement-1',
    role: 'assistant',
    text: "According to the official announcement, the program requirements state that candidates must submit portfolios by June 1.",
  }
  assert.equal(isMessageEligibleForVerification(announcementMsg), true)
})

test('Software version support and technical documentation claim is VISIBLE for verification', () => {
  const versionMsg = {
    id: 'msg-version-1',
    role: 'assistant',
    text: "Python 3.14 supports feature X.",
  }
  assert.equal(isMessageEligibleForVerification(versionMsg), true)

  const reactMsg = {
    id: 'msg-react-1',
    role: 'assistant',
    text: "React 19 removes support for defaultProps on function components.",
  }
  assert.equal(isMessageEligibleForVerification(reactMsg), true)
})

test('Research summary containing externally verifiable claims is VISIBLE for verification', () => {
  const researchMsg = {
    id: 'msg-research-1',
    role: 'assistant',
    text: "A study conducted by researchers found that 40% of software bugs are caught by automated tests.",
  }
  assert.equal(isMessageEligibleForVerification(researchMsg), true)

  const citedReport = {
    id: 'msg-cited-1',
    role: 'assistant',
    text: "According to recent research published in Nature, the model achieves 95% accuracy on unseen datasets.",
  }
  assert.equal(isMessageEligibleForVerification(citedReport), true)
})

test('Streaming placeholder or empty/loading messages are HIDDEN from verification', () => {
  assert.equal(isMessageEligibleForVerification(null), false)
  assert.equal(isMessageEligibleForVerification(undefined), false)
  assert.equal(isMessageEligibleForVerification({ role: 'assistant', text: '' }), false)
  assert.equal(isMessageEligibleForVerification({ role: 'assistant', text: '   ' }), false)
  assert.equal(isMessageEligibleForVerification({ role: 'assistant', text: 'Thinking...' }), false)
  assert.equal(isMessageEligibleForVerification({ role: 'assistant', text: 'Searching the web...' }), false)
  assert.equal(isMessageEligibleForVerification({ role: 'assistant', text: 'Ok' }), false)
  assert.equal(isMessageEligibleForVerification({ role: 'assistant', error: 'Network failure' }), false)
})

test('Already verified message with evidence card is HIDDEN from verification', () => {
  const verifiedMsg = {
    id: 'msg-verified-1',
    role: 'assistant',
    text: "The Nebius x NVIDIA Global AI Hackathon submission deadline is October 30.",
    evidence: {
      claim: "The Nebius x NVIDIA Global AI Hackathon submission deadline is October 30.",
      verdict: "verified",
      confidence: 0.95,
      sources: ["https://nebius.com/hackathon"],
    },
  }
  assert.equal(isMessageEligibleForVerification(verifiedMsg), false)
})

test('Explicit metadata flags are strictly respected', () => {
  const forcedEligible = {
    id: 'msg-forced-1',
    role: 'assistant',
    text: "Custom response that server classified as needing verification.",
    metadata: { verification_eligible: true },
  }
  assert.equal(isMessageEligibleForVerification(forcedEligible), true)

  const forcedIneligible = {
    id: 'msg-forced-2',
    role: 'assistant',
    text: "The Nebius x NVIDIA Global AI Hackathon submission deadline is October 30.",
    metadata: { verification_eligible: false },
  }
  assert.equal(isMessageEligibleForVerification(forcedIneligible), false)
})

test('Two assistant messages with different eligibility: action appears only on eligible message', () => {
  const conversation = [
    {
      id: 'msg-1',
      role: 'assistant',
      text: "Hey! I'm Compass. What's on your mind?",
    },
    {
      id: 'msg-2',
      role: 'user',
      text: "When is the Nebius hackathon deadline?",
    },
    {
      id: 'msg-3',
      role: 'assistant',
      text: "The Nebius x NVIDIA Global AI Hackathon submission deadline is October 30.",
    },
    {
      id: 'msg-4',
      role: 'user',
      text: "Thanks!",
    },
    {
      id: 'msg-5',
      role: 'assistant',
      text: "You're welcome! Let me know if you need anything else.",
    },
  ]

  const eligibility = conversation.map(isMessageEligibleForVerification)

  assert.deepEqual(eligibility, [
    false, // msg-1: initial greeting
    false, // msg-2: user question
    true,  // msg-3: factual deadline claim
    false, // msg-4: user thanks
    false, // msg-5: assistant pleasantry
  ])
})
