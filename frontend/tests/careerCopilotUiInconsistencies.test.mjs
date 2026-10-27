import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanOpportunity, formatJobLocation } from '../src/utils/jobCardCleaner.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(__dirname, '../src')

// Helper: Relative Luminance and Contrast Ratio calculation (WCAG 2.1)
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

function getContrastRatio(hex1, hex2) {
  const parseHex = hex => hex.replace('#', '').match(/.{2}/g).map(x => parseInt(x, 16))
  const l1 = getLuminance(...parseHex(hex1))
  const l2 = getLuminance(...parseHex(hex2))
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

test('Contrast check: Light mode active tab text and indicator achieve >= 4.5:1 contrast', () => {
  const lightBg = '#ffffff'
  const lightAppBg = '#f7f5ef'
  const activeColor = '#b45309' // --tab-active-text / --tab-active-indicator

  const contrastWhite = getContrastRatio(activeColor, lightBg)
  const contrastApp = getContrastRatio(activeColor, lightAppBg)

  assert.ok(contrastWhite >= 4.5, `Contrast on white should be >= 4.5:1, got ${contrastWhite.toFixed(2)}:1`)
  assert.ok(contrastApp >= 4.5, `Contrast on app bg should be >= 4.5:1, got ${contrastApp.toFixed(2)}:1`)
})

test('Contrast check: Dark mode active tab text achieves >= 4.5:1 contrast', () => {
  const darkCard = '#1e1e1b'
  const darkBg = '#151513'
  const activeColor = '#f5a623' // --tab-active-text in dark mode

  const contrastCard = getContrastRatio(activeColor, darkCard)
  const contrastBg = getContrastRatio(activeColor, darkBg)

  assert.ok(contrastCard >= 4.5, `Contrast on dark card should be >= 4.5:1, got ${contrastCard.toFixed(2)}:1`)
  assert.ok(contrastBg >= 4.5, `Contrast on dark bg should be >= 4.5:1, got ${contrastBg.toFixed(2)}:1`)
})

test('Location cleaner: formats duplicate remote entries cleanly into single line', () => {
  const cleaned = formatJobLocation({
    workArrangement: 'remote',
    location: 'Remote',
    country: 'Global',
  })
  assert.equal(cleaned, 'Remote, Global')

  const cleanedOnlyRemote = formatJobLocation({
    workArrangement: 'remote',
    location: 'remote',
    country: null,
  })
  assert.equal(cleanedOnlyRemote, 'Remote')

  const opp = {
    company_name: '1Password',
    role_title: 'Software Engineer',
    work_arrangement: 'remote',
    location: 'Remote',
    country: 'Global',
  }
  const cleanedOpp = cleanOpportunity(opp)
  assert.equal(cleanedOpp.company, '1Password')
  assert.equal(cleanedOpp.locationLine, 'Remote, Global')
})

test('Static audit: RadarOpportunityCard.jsx has exactly one primary amber button and line icons', () => {
  const code = fs.readFileSync(path.join(srcDir, 'components/radar/RadarOpportunityCard.jsx'), 'utf8')

  // No rocket emoji in Prepare Application
  assert.ok(!code.includes('🚀'), 'RadarOpportunityCard must not contain rocket emoji')

  // Prepare Application has line icon Rocket
  assert.ok(code.includes('<Rocket'), 'Prepare Application must use Rocket line icon')

  // Open listing has shortened text
  assert.ok(code.includes('Open listing'), 'RadarOpportunityCard must have shortened "Open listing" label')
  assert.ok(code.includes('title="Open original listing"'), 'RadarOpportunityCard must keep full title tooltip')
  assert.ok(code.includes('aria-label="Open original listing"'), 'RadarOpportunityCard must keep full aria-label')

  // Uses unified card actions class
  assert.ok(code.includes('className="radar-card-actions"'), 'Must use radar-card-actions container')
  assert.ok(code.includes('radar-card-btn-primary'), 'Must designate primary button')
  assert.ok(code.includes('radar-card-btn-secondary'), 'Must designate secondary button')
})

test('Static audit: ApplicationWorkspaceModal.jsx has unified tabs, no emojis in tab definition, and no em dashes', () => {
  const code = fs.readFileSync(path.join(srcDir, 'components/career/ApplicationWorkspaceModal.jsx'), 'utf8')

  // No emojis in TABS array
  assert.ok(!code.includes("icon: '📋'"), 'TABS array must not contain emoji icons')
  assert.ok(!code.includes("icon: '🛰️'"), 'TABS array must not contain emoji icons')
  assert.ok(!code.includes("icon: '🎯'"), 'TABS array must not contain emoji icons')
  assert.ok(!code.includes("icon: '📄'"), 'TABS array must not contain emoji icons')
  assert.ok(!code.includes("icon: '✍️'"), 'TABS array must not contain emoji icons')
  assert.ok(!code.includes("icon: '✅'"), 'TABS array must not contain emoji icons')

  // No em dashes
  assert.ok(!code.includes('—'), 'ApplicationWorkspaceModal must not contain em dashes')

  // Refresh Intel button has no emoji
  assert.ok(!code.includes('🔄 Refresh Intel'), 'Refresh Intel must not use emoji')
  assert.ok(code.includes('RefreshCw'), 'Refresh Intel must use RefreshCw line icon')

  // Tablist accessibility
  assert.ok(code.includes('role="tablist"'), 'Modal must have role="tablist"')
  assert.ok(code.includes('role="tab"'), 'Tabs must have role="tab"')
  assert.ok(code.includes('aria-selected='), 'Tabs must have aria-selected')
  assert.ok(code.includes('cleanOpportunity'), 'Modal must use cleanOpportunity for header location')
})

test('CSS audit: index.css defines 44px height, 6px radius, and responsive 2-row layout on narrow cards', () => {
  const css = fs.readFileSync(path.join(srcDir, 'index.css'), 'utf8')

  // 44px buttons and tabs
  assert.ok(css.includes('height: 44px;'), 'CSS must define 44px height')
  assert.ok(css.includes('--radius-btn, 6px'), 'CSS must use 6px radius for buttons')
  assert.ok(css.includes('--radius-tab, 6px'), 'CSS must use 6px radius for tabs')

  // Unified tab active underline indicator
  assert.ok(css.includes('border-bottom: 2px solid var(--tab-active-indicator);'), 'CSS must use 2px accent underline')

  // Narrow card responsive behavior: primary goes full width, secondaries share row below at equal widths
  assert.ok(css.includes('grid-template-columns: 1fr 1fr;'), 'CSS must use 2-column grid for narrow card actions')
  assert.ok(css.includes('.radar-card-btn-primary {\n    grid-column: 1 / -1;'), 'Primary button must go full width on narrow cards')
})
