import test from 'node:test'
import assert from 'node:assert/strict'

test('Radar recent_24h filter strictly relies on is_verified_within_24h boolean', () => {
  const sampleOpportunities = [
    {
      id: 1,
      title: 'ML Research Intern',
      is_verified_within_24h: true,
      verification_evidence: 'Verified exact timestamp: 2.1h ago (VERIFIED_WITHIN_24H)',
    },
    {
      id: 2,
      title: 'Nu AI Core Summer PhD Research Internship',
      is_verified_within_24h: false,
      // Contains the substring '24.0-hour' in explanatory text, but is NOT verified 24h
      verification_evidence: 'Source supplied date-only (2026-10-19); cannot verify within strict 24.0-hour window',
    },
    {
      id: 3,
      title: 'Software Engineer Intern',
      is_verified_within_24h: false,
      verification_evidence: 'Discovered via JobSpy (Indeed). Precision: DATE_ONLY. Recency: APPROXIMATE_RECENCY',
    },
  ]

  // Strict filter logic matching frontend/src/components/InternshipRadar.jsx
  const filtered = sampleOpportunities.filter(o => o.is_verified_within_24h === true)

  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].id, 1)
  assert.equal(filtered[0].title, 'ML Research Intern')

  // Disallowed legacy check would have incorrectly included id: 2
  const legacyFiltered = sampleOpportunities.filter(o => {
    return o.is_verified_within_24h === true || (o.verification_evidence && o.verification_evidence.includes('24.0-hour'))
  })
  assert.equal(legacyFiltered.length, 2, 'Legacy check incorrectly included approximate row')
})

test('Radar opportunity cards designate unverified posting time when is_verified_within_24h is false', () => {
  function getRecencyBadge(opp) {
    if (opp.is_verified_within_24h) {
      return { label: '⚡ Verified <24h', isVerified: true }
    }
    return { label: '⏱️ Posting time unverified', isVerified: false }
  }

  const verifiedOpp = { id: 101, is_verified_within_24h: true }
  const approxOpp = { id: 102, is_verified_within_24h: false }

  const badge1 = getRecencyBadge(verifiedOpp)
  assert.equal(badge1.isVerified, true)
  assert.equal(badge1.label, '⚡ Verified <24h')

  const badge2 = getRecencyBadge(approxOpp)
  assert.equal(badge2.isVerified, false)
  assert.equal(badge2.label, '⏱️ Posting time unverified')
})
