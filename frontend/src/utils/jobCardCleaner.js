/**
 * jobCardCleaner.js
 * Unified display helper for cleaning job / internship opportunity fields
 * across Radar cards, Radar detail modals, saved jobs, and Applications.
 */

export function cleanText(val) {
  if (val === null || val === undefined) return null
  const s = String(val).trim()
  const lower = s.toLowerCase()
  if (
    lower === '' ||
    lower === 'nan' ||
    lower === 'null' ||
    lower === 'undefined' ||
    lower === 'none' ||
    lower === 'n/a'
  ) {
    return null
  }
  return s
}

export function cleanSource(rawSource) {
  const clean = cleanText(rawSource)
  if (!clean) return null

  // Drop internal tool names like JobSpy and extract the user-facing source name
  // e.g. "JobSpy (Glassdoor)" -> "Glassdoor"
  const jobSpyMatch = clean.match(/jobspy\s*\(([^)]+)\)/i)
  if (jobSpyMatch && jobSpyMatch[1]) {
    return jobSpyMatch[1].trim()
  }

  // e.g. "jobspy_linkedin" -> "LinkedIn"
  if (/^jobspy_/i.test(clean)) {
    const site = clean.replace(/^jobspy_/i, '').trim()
    return site ? site.charAt(0).toUpperCase() + site.slice(1) : 'Job Board'
  }

  // Exact "JobSpy" -> "Job Board"
  if (clean.toLowerCase() === 'jobspy') {
    return 'Job Board'
  }

  return clean
}

export function formatJobLocation({
  workArrangement,
  location,
  country,
}) {
  const cleanMode = cleanText(workArrangement)
  const cleanLoc = cleanText(location)
  const cleanCtry = cleanText(country)

  const modeLower = (cleanMode || '').toLowerCase()
  const locLower = (cleanLoc || '').toLowerCase()
  const ctryLower = (cleanCtry || '').toLowerCase()

  const isRemote = modeLower === 'remote' || locLower === 'remote'
  const isHybrid = modeLower === 'hybrid' || locLower === 'hybrid'

  // Extract non-remote place from location string if mixed (e.g. "Remote, India" or "Pune")
  let place = null
  if (cleanLoc && locLower !== 'remote' && locLower !== 'flexible') {
    // If loc contains "Remote - India" or "Remote, India", clean it
    place = cleanLoc
      .replace(/remote\s*[-•·,]\s*/gi, '')
      .replace(/\s*[-•·,]\s*remote/gi, '')
      .trim()
  }

  if (!place && cleanCtry && ctryLower !== 'remote') {
    place = cleanCtry
  }

  if (isRemote) {
    if (place && place.toLowerCase() !== 'remote') {
      return `Remote, ${place}`
    }
    return 'Remote'
  }

  if (isHybrid) {
    if (place && place.toLowerCase() !== 'hybrid') {
      return `Hybrid, ${place}`
    }
    return 'Hybrid'
  }

  if (place) {
    return place
  }

  if (cleanMode) {
    return cleanMode.charAt(0).toUpperCase() + cleanMode.slice(1)
  }

  return 'Location unspecified'
}

export function cleanOpportunity(opportunity) {
  if (!opportunity || typeof opportunity !== 'object') {
    return {
      company: 'Company',
      role: 'Internship Opportunity',
      locationLine: 'Location unspecified',
      salary: null,
      verificationBadge: { label: 'Needs verification', bg: 'var(--bg-card-soft)', text: 'var(--text-secondary)', border: 'var(--border)' },
      eligibilityBadge: { label: 'Eligibility unconfirmed', bg: 'var(--bg-card-soft)', text: 'var(--text-muted)', border: 'var(--border)' },
      footerLine: 'Posting date unrecorded',
      restrictions: [],
      isMissingProfile: false,
      cleanedExplanation: null,
    }
  }

  const company = cleanText(opportunity.company_name) || 'Company'
  const role = cleanText(opportunity.role_title) || 'Internship Opportunity'
  const salary = cleanText(opportunity.compensation)

  const locationLine = formatJobLocation({
    workArrangement: opportunity.work_arrangement,
    location: opportunity.location,
    country: opportunity.country,
  })

  // Verification Badge: exactly one verification chip
  let verificationBadge
  switch (opportunity.current_status) {
    case 'OPEN_CONFIRMED':
      verificationBadge = {
        label: 'Verified open',
        bg: 'rgba(28, 138, 98, 0.08)',
        text: 'var(--domain-code, #1c8a62)',
        border: 'rgba(28, 138, 98, 0.25)',
      }
      break
    case 'UPCOMING_CONFIRMED':
    case 'ANNOUNCED':
      verificationBadge = {
        label: 'Upcoming confirmed',
        bg: 'rgba(47, 100, 200, 0.08)',
        text: 'var(--domain-coursework, #2f64c8)',
        border: 'rgba(47, 100, 200, 0.25)',
      }
      break
    case 'CLOSED_CONFIRMED':
      verificationBadge = {
        label: 'Closed',
        bg: 'var(--bg-card-soft)',
        text: 'var(--text-muted)',
        border: 'var(--border)',
      }
      break
    default:
      verificationBadge = {
        label: 'Needs verification',
        bg: 'var(--bg-card-soft)',
        text: 'var(--text-secondary)',
        border: 'var(--border)',
      }
  }

  // Eligibility Badge: exactly one eligibility chip
  let eligibilityBadge
  switch (opportunity.eligibility_classification) {
    case 'ELIGIBLE':
      eligibilityBadge = {
        label: 'Eligible',
        bg: 'rgba(28, 138, 98, 0.08)',
        text: 'var(--domain-code, #1c8a62)',
        border: 'rgba(28, 138, 98, 0.25)',
      }
      break
    case 'POTENTIAL_MATCH':
    case 'POTENTIALLY_ELIGIBLE':
      eligibilityBadge = {
        label: 'Eligible',
        bg: 'rgba(245, 166, 35, 0.1)',
        text: 'var(--brand-dark, #b47507)',
        border: 'rgba(245, 166, 35, 0.3)',
      }
      break
    case 'INELIGIBLE':
      eligibilityBadge = {
        label: 'Not eligible',
        bg: 'var(--danger-bg, #fdeaea)',
        text: 'var(--danger-text, #b91c1c)',
        border: 'rgba(185, 28, 28, 0.25)',
      }
      break
    case 'INSUFFICIENT_INFORMATION':
    default:
      eligibilityBadge = {
        label: 'Eligibility unconfirmed',
        bg: 'var(--bg-card-soft)',
        text: 'var(--text-muted)',
        border: 'var(--border)',
      }
  }

  // Restrictions (Drop separate "Location: India" tag per rule 4)
  const restrictions = []
  const req = opportunity.requirements
  if (req && typeof req === 'object') {
    if (req.eligible_graduation_years && req.eligible_graduation_years.length > 0) {
      restrictions.push(`Batch: ${req.eligible_graduation_years.join('/')}`)
    }
    if (req.eligible_academic_years && req.eligible_academic_years.length > 0) {
      restrictions.push(`Year: ${req.eligible_academic_years.join('/')}`)
    }
    if (req.eligible_degree_types && req.eligible_degree_types.length > 0) {
      restrictions.push(`Degree: ${req.eligible_degree_types.join('/')}`)
    }
    if (req.no_active_backlogs === true) {
      restrictions.push('0 Active Backlogs')
    }
    if (req.work_auth_required === true && opportunity.country && opportunity.country.toLowerCase() !== 'india') {
      restrictions.push(`Requires ${opportunity.country} Work Auth`)
    }
    // Drop separate "Location: India" or Location: <country> tag as locationLine handles it cleanly
  }

  // Missing profile check
  const rawExpl = cleanText(opportunity.eligibility_explanation)
  const isMissingProfile = Boolean(
    rawExpl &&
    (rawExpl.toLowerCase().includes('no candidate profile found') ||
     rawExpl.toLowerCase().includes('complete your profile in resume studio'))
  )
  const cleanedExplanation = isMissingProfile ? null : rawExpl

  // Dates & Footer
  const rawPosted = opportunity.posted_at || opportunity.confirmed_open_date
  let postedStr = null
  if (cleanText(rawPosted)) {
    try {
      const d = new Date(rawPosted)
      if (!isNaN(d.getTime())) {
        postedStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      }
    } catch {
      /* ignore */
    }
  }

  const rawVerified = opportunity.last_verified_at
  let verifiedStr = null
  if (cleanText(rawVerified)) {
    try {
      const d = new Date(rawVerified)
      if (!isNaN(d.getTime())) {
        verifiedStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      }
    } catch {
      /* ignore */
    }
  }

  // Source name: clean, no JobSpy
  const rawSource =
    (opportunity.sources && opportunity.sources.length > 0 && opportunity.sources[0]?.source_name) ||
    opportunity.source_identifier ||
    (opportunity.official_source_confirmed ? 'Official Careers Site' : null)
  const sourceName = cleanSource(rawSource)

  // One line footer: e.g. "Posted 23 Oct, checked 24 Oct via Glassdoor"
  const footerParts = []
  if (postedStr) {
    footerParts.push(`Posted ${postedStr}`)
  } else {
    footerParts.push('Posting date unrecorded')
  }

  if (verifiedStr) {
    footerParts.push(`checked ${verifiedStr}`)
  }

  let footerLine = footerParts.join(', ')
  if (sourceName) {
    footerLine += ` via ${sourceName}`
  }

  return {
    company,
    role,
    locationLine,
    salary,
    verificationBadge,
    eligibilityBadge,
    footerLine,
    restrictions,
    isMissingProfile,
    cleanedExplanation,
  }
}
