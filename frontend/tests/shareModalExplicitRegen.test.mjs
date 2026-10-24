import test from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

test('ShareModal: does not automatically regenerate token on mount', () => {
  const code = fs.readFileSync(path.resolve('src/components/ShareModal.jsx'), 'utf-8')
  
  // Verify ensureShareToken is NOT invoked on mount
  assert.ok(!code.includes('ensureShareToken()'), 'Modal must not automatically call ensureShareToken on mount')
  assert.ok(!code.includes('updateConversation(conversation.id, { is_shared: true })') ||
            code.includes('const handleGenerateLink = async () => {'),
            'Token generation must be isolated to explicit handleGenerateLink action')
})

test('ShareModal: displays existing state when conversation is shared without token', () => {
  const code = fs.readFileSync(path.resolve('src/components/ShareModal.jsx'), 'utf-8')

  assert.ok(code.includes('This conversation is currently shared'), 'Must inform user that link is active')
  assert.ok(code.includes('btn-create-new-link'), 'Must provide explicit action button to create new link')
})

test('ShareModal: displays warning before regenerating active link', () => {
  const code = fs.readFileSync(path.resolve('src/components/ShareModal.jsx'), 'utf-8')

  assert.ok(code.includes('Creating a new link will immediately revoke the existing link'), 'Must warn that old link is invalidated')
  assert.ok(code.includes('btn-confirm-regen-link'), 'Must require explicit confirmation before regeneration')
})
