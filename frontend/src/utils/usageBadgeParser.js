/**
 * Parses usageBadge string like "⚡ 2385 calls · $1.43777" into structured components with tabular formatting.
 */
export function parseUsageBadge(badge) {
  if (!badge || typeof badge !== 'string') return null
  const trimmed = badge.trim()
  const match = trimmed.match(/(?:⚡\s*)?([\d,]+)\s*calls\s*·\s*(\$[\d.]+)/i)
  if (match) {
    const rawCalls = match[1].replace(/,/g, '')
    const numCalls = Number(rawCalls)
    const formattedCalls = !isNaN(numCalls) ? `${numCalls.toLocaleString()} calls` : `${match[1]} calls`
    const cost = match[2]
    return {
      isUsage: true,
      calls: formattedCalls,
      cost,
      fullText: `${formattedCalls} · ${cost}`,
    }
  }
  return {
    isUsage: false,
    text: trimmed,
    fullText: trimmed,
  }
}
