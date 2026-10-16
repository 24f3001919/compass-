import React from 'react'

function parseInlineFormatting(text) {
  if (!text) return ''

  // Split on bold, italic, code
  const parts = []
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index))
    }
    const token = match[0]
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={match.index} style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(<em key={match.index}>{token.slice(1, -1)}</em>)
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={match.index}
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '12px',
            padding: '2px 5px',
            borderRadius: '4px',
            background: 'var(--bg-card-soft, rgba(0, 0, 0, 0.05))',
            color: 'var(--code-text, #e11d48)',
          }}
        >
          {token.slice(1, -1)}
        </code>
      )
    }
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex))
  }

  return parts.length > 0 ? parts : text
}

export default function MarkdownRenderer({ content }) {
  if (!content) return null

  const cleaned = content.replace(/\[\[modes\]\]/gi, '').trim()
  const lines = cleaned.split('\n')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13.5px', lineHeight: '1.6' }}>
      {lines.map((line, i) => {
        const trimmed = line.trim()

        // 1. Router Latency Badge Chip (⚡ [Routed via Nemotron-3 Nano in 342ms])
        if (line.includes('Routed via Nemotron-3 Nano') || (line.includes('⚡') && line.includes('ms'))) {
          return (
            <div key={i} className="router-chip" style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px',
              borderRadius: '6px',
              background: 'var(--bg-card-soft, rgba(0, 0, 0, 0.04))',
              border: '1px solid var(--border)',
              fontSize: '11.5px',
              color: 'var(--text-secondary)',
              margin: '4px 0',
              fontFamily: 'JetBrains Mono, monospace',
            }}>
              <span>⚡</span>
              <span>{line.replace('⚡', '').trim()}</span>
            </div>
          )
        }

        // 2. Headings (###, ##, #)
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={i} style={{ margin: '10px 0 3px 0', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
              {parseInlineFormatting(trimmed.substring(4))}
            </h4>
          )
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={i} style={{ margin: '14px 0 4px 0', fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' }}>
              {parseInlineFormatting(trimmed.substring(3))}
            </h3>
          )
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={i} style={{ margin: '16px 0 6px 0', fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>
              {parseInlineFormatting(trimmed.substring(2))}
            </h2>
          )
        }

        // 3. Coursework Deliverables Heading
        if (line.includes('Coursework') && (line.includes('📚') || line.includes('CS 61C'))) {
          return (
            <div key={i} style={{ marginTop: '10px', marginBottom: '4px', color: 'var(--coursework-text)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="badge-coursework" style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', textTransform: 'uppercase' }}>
                Coursework
              </span>
              <span>{line.replace(/^\d+\.\s*/, '').replace('📚', '').trim()}</span>
            </div>
          )
        }

        // 4. Hackathon Deliverables Heading
        if (line.includes('Hackathon') && (line.includes('🚀') || line.includes('Nebius'))) {
          return (
            <div key={i} style={{ marginTop: '10px', marginBottom: '4px', color: 'var(--hackathon-text)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="badge-hackathon" style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', textTransform: 'uppercase' }}>
                Hackathon
              </span>
              <span>{line.replace(/^\d+\.\s*/, '').replace('🚀', '').trim()}</span>
            </div>
          )
        }

        // 5. Actionable Next Step Callout
        if (line.includes('Next Step:')) {
          return (
            <div key={i} style={{
              marginTop: '10px',
              marginBottom: '6px',
              padding: '10px 14px',
              borderRadius: '10px',
              background: 'var(--bg-card-soft, rgba(0,0,0,0.03))',
              border: '1px solid var(--border)',
              color: 'var(--code-text, inherit)',
              fontSize: '12.5px',
              fontFamily: 'JetBrains Mono, monospace',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ color: 'var(--code, #e11d48)' }}>❯</span>
              <span>{line}</span>
            </div>
          )
        }

        // 6. Bullet Points (•, -, *)
        if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('* ')) {
          const bulletText = trimmed.replace(/^[•\-\*]\s*/, '')
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', margin: '2px 0 2px 6px', color: 'var(--text-primary)', fontSize: '13.5px' }}>
              <span style={{ color: 'var(--coursework, #3b82f6)', fontWeight: '700', lineHeight: '1.4' }}>•</span>
              <span style={{ lineHeight: '1.5' }}>{parseInlineFormatting(bulletText)}</span>
            </div>
          )
        }

        // 7. Numbered lists (1. , 2. )
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/)
        if (numMatch) {
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', margin: '2px 0 2px 6px', color: 'var(--text-primary)', fontSize: '13.5px' }}>
              <span style={{ color: 'var(--coursework, #3b82f6)', fontWeight: '600', minWidth: '18px', lineHeight: '1.4' }}>{numMatch[1]}.</span>
              <span style={{ lineHeight: '1.5' }}>{parseInlineFormatting(numMatch[2])}</span>
            </div>
          )
        }

        // 8. Empty lines
        if (!trimmed) {
          return <div key={i} style={{ height: '6px' }} />
        }

        // 9. Standard Text Paragraph
        return (
          <p key={i} style={{ margin: '2px 0', lineHeight: '1.6', color: 'var(--text-primary)' }}>
            {parseInlineFormatting(line)}
          </p>
        )
      })}
    </div>
  )
}
