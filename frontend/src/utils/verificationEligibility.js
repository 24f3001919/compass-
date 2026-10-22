/**
 * Compass — Verification Eligibility Engine
 *
 * Evaluates whether an assistant message contains factual claims
 * (deadlines, opportunity application timelines, official announcements,
 * policy requirements, technical version support, or research claims)
 * that genuinely benefit from external verification with Tavily.
 *
 * Follows strict principles:
 * - Greetings, pleasantries, task confirmations, and simple code are NEVER eligible.
 * - Empty messages, streaming placeholders, and tool statuses are NEVER eligible.
 * - Mere presence of dates, numbers, URLs, or words like "search" does NOT confer eligibility.
 * - Explicit metadata flags (needs_verification / verification_eligible) are respected.
 */

// Positive Claim Matchers
const HACKATHON_CLAIM = /\b(hackathon|competition|contest|bounty program)\b/i
const HACKATHON_INDICATORS = /\b(submission|registration|entry|project|deadline|closes?|closing|due|starts?|ends?|held on|scheduled for)\b/i

const OPPORTUNITY_CLAIM = /\b(internship|fellowship|co-op|job application|residency program)\b/i
const OPPORTUNITY_INDICATORS = /\b(deadline|close[sd]?|open[sd]?|due|eligibility|requirements?|applications?\s+(close|open|due))\b/i

const EXPLICIT_DEADLINE = /\b(submission|registration|application|entry)\s+deadline\s+(is|are|closes?|falls?\s+on|has been set to)\b/i
const DEADLINE_WITH_DATE = /\bdeadline\s+(is|on|by)\s+(january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}[/-]\d{1,2}|\d{4})\b/i

const SOFTWARE_VERSION = /\b(python|node(?:\.js)?|react|vue|angular|rust|golang|go|java|typescript|c\+\+|fastapi|pydantic|next(?:\.js)?|postgres|postgresql)\s+v?\d+(?:\.\d+)*\b/i
const VERSION_CLAIM = /\b(supports?|deprecated|released|features?|requires?|compatibility|introduced|removes?|added|breaking change)\b/i

const POLICY_OR_ANNOUNCEMENT = /\b(company policy|official announcement|program requirements?|eligibility requirements?|press release|terms of service)\b/i
const POLICY_ACTION = /\b(requires?|mandates?|stipulates?|announced|effective|updated|states?|prohibits?)\b/i

const RESEARCH_OR_CITATIONS = /\b(study conducted by|research (shows|indicates|found)|published in\s+[A-Z]|according to (recent )?(research|reports?|studies|data|the fda|the sec|the cdc|who|nih|official))\b/i

// Routine / Negative Matchers
const INCOMPLETE_OR_QUESTION = /^(do you want|would you like|should i|shall i|can i help you|did you mean|would you prefer)\b/i
const TOOL_STATUS = /^(searching|loading|fetching|thinking|querying|checking)(\s+the\s+web|\s+for|\.\.\.)/i
const INSUFFICIENT_INFO = /^i (can'?t|cannot|am unable to) (determine|find|verify|answer)/i

/**
 * Inspect text to identify whether substantive external factual claims exist.
 */
function containsVerifiableFact(text) {
  if (!text || typeof text !== 'string') return false

  // 1. Hackathon / competition deadline or event schedule
  if (HACKATHON_CLAIM.test(text) && HACKATHON_INDICATORS.test(text)) {
    return true
  }

  // 2. Internship / opportunity application deadline or requirement
  if (OPPORTUNITY_CLAIM.test(text) && OPPORTUNITY_INDICATORS.test(text)) {
    return true
  }

  // 3. Explicit deadline with date or context
  if (EXPLICIT_DEADLINE.test(text) || DEADLINE_WITH_DATE.test(text)) {
    return true
  }

  // 4. Software version support / deprecation / release claim
  if (SOFTWARE_VERSION.test(text) && VERSION_CLAIM.test(text)) {
    return true
  }

  // 5. Official policy, announcement, or institutional requirement
  if (POLICY_OR_ANNOUNCEMENT.test(text) && POLICY_ACTION.test(text)) {
    return true
  }

  // 6. External research summary or cited report
  if (RESEARCH_OR_CITATIONS.test(text)) {
    return true
  }

  return false
}

/**
 * Evaluates whether an assistant message should display the "Verify with Tavily" action button.
 *
 * @param {object|string} message - Message object or message content string
 * @returns {boolean} True if verification action should be visible
 */
export function isMessageEligibleForVerification(message) {
  if (!message) return false

  // If passed as an object, check object-level invariants
  if (typeof message === 'object') {
    // Only assistant messages can offer verification
    if (message.role && message.role !== 'assistant') return false

    // Error messages and messages that already have verification evidence should not display the button
    if (message.error || message.evidence) return false

    // Explicit server-side or metadata flag override
    if (message.needs_verification === true || message.metadata?.verification_eligible === true) {
      return true
    }
    if (message.needs_verification === false || message.metadata?.verification_eligible === false) {
      return false
    }
  }

  const rawText = typeof message === 'string' ? message : (message.text || '')
  if (typeof rawText !== 'string') return false
  const text = rawText.trim()

  // Empty message or trivial placeholder
  if (!text || text.length < 15) return false

  // Tool status / loading notification
  if (TOOL_STATUS.test(text)) return false

  // Non-answer / insufficient information
  if (INSUFFICIENT_INFO.test(text) && !containsVerifiableFact(text)) return false

  // Unanswered clarification question from assistant
  if (INCOMPLETE_OR_QUESTION.test(text) && text.endsWith('?')) return false

  // Must contain substantive verifiable factual claims
  return containsVerifiableFact(text)
}
