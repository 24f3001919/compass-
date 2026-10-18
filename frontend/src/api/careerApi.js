/**
 * Compass — Career Copilot API Client.
 * Communicates with /api/career/* endpoints for:
 * - Master & tailored resume management
 * - Factual validation reports & HTML export
 * - Applications pipeline & batch approvals
 * - Submission adapters & execution
 */

import { API_BASE as BASE_URL } from './baseClient'

const API_BASE = `${BASE_URL}/api/career`

function getHeaders() {
  const headers = { 'Content-Type': 'application/json' }
  try {
    const token = localStorage.getItem('compass_token')
    if (token) headers['Authorization'] = `Bearer ${token}`
    const guestId = localStorage.getItem('compass_guest_id')
    if (guestId) headers['x-guest-id'] = guestId
  } catch {
    /* ignore storage access error */
  }
  return headers
}

// ---------------------------------------------------------------------------
// Resume Studio API
// ---------------------------------------------------------------------------

export async function fetchMasterResume() {
  const res = await fetch(`${API_BASE}/resumes/master`, { headers: getHeaders() })
  if (!res.ok) throw new Error(`Failed to fetch master resume: ${res.statusText}`)
  return res.json()
}

export async function updateMasterResume(content) {
  const res = await fetch(`${API_BASE}/resumes/master`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(content),
  })
  if (!res.ok) throw new Error(`Failed to update master resume: ${res.statusText}`)
  return res.json()
}

export async function fetchResumes() {
  const res = await fetch(`${API_BASE}/resumes`, { headers: getHeaders() })
  if (!res.ok) throw new Error(`Failed to list resumes: ${res.statusText}`)
  return res.json()
}

export async function tailorResume(opportunityId, customTitle = null, targetSkills = null) {
  const res = await fetch(`${API_BASE}/resumes/tailor`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      opportunity_id: opportunityId,
      custom_title: customTitle,
      target_skills_emphasis: targetSkills,
    }),
  })
  if (!res.ok) throw new Error(`Failed to tailor resume: ${res.statusText}`)
  return res.json()
}

export async function fetchResume(resumeId) {
  const res = await fetch(`${API_BASE}/resumes/${resumeId}`, { headers: getHeaders() })
  if (!res.ok) throw new Error(`Failed to fetch resume: ${res.statusText}`)
  return res.json()
}

export async function updateResume(resumeId, payload) {
  const res = await fetch(`${API_BASE}/resumes/${resumeId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Failed to update resume: ${res.statusText}`)
  return res.json()
}

export async function validateResume(resumeId) {
  const res = await fetch(`${API_BASE}/resumes/${resumeId}/validate`, {
    method: 'POST',
    headers: getHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to validate resume: ${res.statusText}`)
  return res.json()
}

export function getResumeExportUrl(resumeId, template = null) {
  if (template) {
    return `${API_BASE}/resumes/${resumeId}/export?template=${encodeURIComponent(template)}`
  }
  return `${API_BASE}/resumes/${resumeId}/export`
}


export async function parseUploadResume(rawText) {
  const res = await fetch(`${API_BASE}/resumes/parse-upload`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ raw_text: rawText }),
  })
  if (!res.ok) throw new Error(`Failed to parse resume text: ${res.statusText}`)
  return res.json()
}

export async function parseResumeFile(file) {
  const formData = new FormData()
  formData.append('file', file)
  const headers = {}
  try {
    const token = localStorage.getItem('compass_token')
    if (token) headers['Authorization'] = `Bearer ${token}`
    const guestId = localStorage.getItem('compass_guest_id')
    if (guestId) headers['x-guest-id'] = guestId
  } catch {
    /* ignore storage access error */
  }
  const res = await fetch(`${API_BASE}/resumes/parse-file`, {
    method: 'POST',
    headers,
    body: formData,
  })
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.detail || `Failed to parse resume file: ${res.statusText}`)
  }
  return res.json()
}

export async function draftCoverLetter(opportunityId, emphasisProjects = null) {
  const res = await fetch(`${API_BASE}/cover-letters/draft`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      opportunity_id: opportunityId,
      emphasis_projects: emphasisProjects,
    }),
  })
  if (!res.ok) throw new Error(`Failed to draft cover letter: ${res.statusText}`)
  return res.json()
}

export async function setApplicationCoverLetter(appId, coverLetter) {
  const res = await fetch(`${API_BASE}/applications/${appId}/cover-letter`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ cover_letter: coverLetter }),
  })
  if (!res.ok) throw new Error(`Failed to attach cover letter: ${res.statusText}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Application Center API
// ---------------------------------------------------------------------------

export async function fetchApplications(status = null) {
  const url = status ? `${API_BASE}/applications?status=${encodeURIComponent(status)}` : `${API_BASE}/applications`
  const res = await fetch(url, { headers: getHeaders() })
  if (!res.ok) throw new Error(`Failed to list applications: ${res.statusText}`)
  return res.json()
}

export async function fetchPreparedApplication(opportunityId) {
  const res = await fetch(`${API_BASE}/applications/prepare?opportunity_id=${opportunityId}`, {
    method: 'GET',
    headers: getHeaders(),
  })
  if (!res.ok) {
    if (res.status === 404) return null
    throw new Error(`Failed to fetch prepared application: ${res.statusText}`)
  }
  return res.json()
}

export async function prepareApplication(opportunityId) {
  const res = await fetch(`${API_BASE}/applications/prepare?opportunity_id=${opportunityId}`, {
    method: 'POST',
    headers: getHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to prepare application: ${res.statusText}`)
  return res.json()
}


export async function updateApplication(appId, updates) {
  const res = await fetch(`${API_BASE}/applications/${appId}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error(`Failed to update application: ${res.statusText}`)
  return res.json()
}

export async function prepareBatch(opportunityIds) {
  const res = await fetch(`${API_BASE}/applications/batch/prepare`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ opportunity_ids: opportunityIds }),
  })
  if (!res.ok) throw new Error(`Failed to prepare batch: ${res.statusText}`)
  return res.json()
}

export async function fetchBatch(batchId) {
  const res = await fetch(`${API_BASE}/applications/batch/${batchId}`, { headers: getHeaders() })
  if (!res.ok) throw new Error(`Failed to fetch batch: ${res.statusText}`)
  return res.json()
}

export async function approveBatch(batchId, attestations = {}) {
  const res = await fetch(`${API_BASE}/applications/batch/${batchId}/approve`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      batch_id: batchId,
      attestation_confirmed: attestations.attestation_confirmed ?? true,
      work_auth_confirmed: attestations.work_auth_confirmed ?? true,
      legal_statements_accepted: attestations.legal_statements_accepted ?? true,
    }),
  })
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.detail || `Failed to approve batch: ${res.statusText}`)
  }
  return res.json()
}

export async function submitBatch(batchId, preferredMethod = 'manual_handoff') {
  const res = await fetch(`${API_BASE}/applications/batch/${batchId}/submit`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      batch_id: batchId,
      preferred_method: preferredMethod,
    }),
  })
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.detail || `Failed to submit batch: ${res.statusText}`)
  }
  return res.json()
}

export async function fetchAdapters() {
  const res = await fetch(`${API_BASE}/adapters`, { headers: getHeaders() })
  if (!res.ok) throw new Error(`Failed to fetch adapters: ${res.statusText}`)
  return res.json()
}
