export const KNOWN_FIELDS = new Set([
  'id', 'domain', 'project', 'timestamp', 'title', 'tags',
  'countdown', 'vector_dim', 'description'
])

export const DOMAIN_META = {
  hackathon: { label: 'Hackathon', icon: '🚀', color: '#f5a623', border: 'var(--border)' },
  coursework: { label: 'Coursework', icon: '📚', color: '#2f64c8', border: 'var(--border)' },
  code: { label: 'Code', icon: '💻', color: '#1c8a62', border: 'var(--border)' },
  general: { label: 'General', icon: '🌐', color: '#6b7a86', border: 'var(--border)' },
  other: { label: 'Other', icon: '🏷️', color: '#7e68b5', border: 'var(--border)' },
}

export function normalizeDomainKey(name) {
  if (!name) return ''
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function getCustomDomains() {
  try {
    const raw = localStorage.getItem('compass.custom_domains')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    /* ignore storage read error */
  }
  return []
}

export function saveCustomDomain(domain) {
  try {
    const existing = getCustomDomains()
    const filtered = existing.filter(d => d.key !== domain.key)
    filtered.push(domain)
    localStorage.setItem('compass.custom_domains', JSON.stringify(filtered))
    return filtered
  } catch (err) {
    console.warn('Failed to save custom domain to localStorage:', err)
    return []
  }
}

export function removeCustomDomain(domainKey) {
  try {
    const existing = getCustomDomains()
    const filtered = existing.filter(d => d.key !== domainKey)
    localStorage.setItem('compass.custom_domains', JSON.stringify(filtered))
    return filtered
  } catch (err) {
    console.warn('Failed to remove custom domain from localStorage:', err)
    return []
  }
}

export function getDomainMeta(dom) {
  if (!dom) return DOMAIN_META.general
  const key = String(dom).toLowerCase().trim()
  if (DOMAIN_META[key]) return DOMAIN_META[key]

  const custom = getCustomDomains().find(d => d.key === key)
  if (custom) {
    return {
      label: custom.label || (key.charAt(0).toUpperCase() + key.slice(1)),
      icon: custom.icon || '🏷️',
      color: custom.color || '#7e68b5',
      border: 'var(--border)',
    }
  }

  return {
    label: key.charAt(0).toUpperCase() + key.slice(1),
    icon: '🏷️',
    color: '#7e68b5',
    border: 'var(--border)',
  }
}

export function formatFieldLabel(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

export function formatFieldValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}
