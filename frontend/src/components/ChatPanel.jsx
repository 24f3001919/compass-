import React, { useState, useEffect, useRef } from 'react'
import { streamQueryFromAssistant } from '../api/client'

function getTimeGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function ChatPanel({
  messages, setMessages, conversationId, setConversationId, onSendMessage, isTyping, onChatComplete,
  tasks = [], backendStatus = ''
}) {
  const [input, setInput] = useState('')
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [showContext, setShowContext] = useState(true)
  const messagesEndRef = useRef(null)
  const streamTimerRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Auto-scroll whenever messages, streaming tokens, or typing status changes
  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingText, isTyping])

  // Cleanup timer if component unmounts mid-stream
  useEffect(() => {
    return () => {
      if (streamTimerRef.current) {
        clearInterval(streamTimerRef.current)
      }
    }
  }, [])

  /**
   * Token Streaming & Typewriter Mechanism (Fallback)
   * Chunks 3–5 characters or 1 token every 18ms for progressive delivery when SSE is unavailable.
   */
  const streamAssistantResponse = (fullText) => {
    setIsStreaming(true)
    setStreamingText('')

    // Divide text into token-like chunks (3 to 6 characters or word chunks)
    const chunks = []
    let cursor = 0
    while (cursor < fullText.length) {
      const nextSpace = fullText.indexOf(' ', cursor)
      let take = 4
      if (nextSpace !== -1 && nextSpace - cursor <= 6) {
        take = nextSpace - cursor + 1
      }
      chunks.push(fullText.slice(cursor, cursor + take))
      cursor += take
    }

    let chunkIndex = 0
    let accumulated = ''

    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current)
    }

    streamTimerRef.current = setInterval(() => {
      if (chunkIndex < chunks.length) {
        accumulated += chunks[chunkIndex]
        setStreamingText(accumulated)
        chunkIndex++
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      } else {
        clearInterval(streamTimerRef.current)
        streamTimerRef.current = null
        setIsStreaming(false)
        setStreamingText('')
        setMessages(prev => [...prev, { role: 'assistant', text: fullText }])
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    }, 18)
  }

  const handleSend = async (textToSend) => {
    const text = (textToSend || input).trim()
    if (!text || isStreaming || isTyping) return
    setInput('')

    // 1. Add user message to conversation
    setMessages(prev => [...prev, { role: 'user', text }])
    setIsStreaming(true)
    setStreamingText('')

    let receivedTokens = ''

    try {
      // 2. Attempt real Server-Sent Events streaming from Nebius endpoint
      await streamQueryFromAssistant(text, conversationId, {
        onToken: (token, full) => {
          receivedTokens = full
          setStreamingText(full)
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        },
        onComplete: (doneData) => {
          setIsStreaming(false)
          setStreamingText('')
          if (receivedTokens) {
            setMessages(prev => [...prev, { role: 'assistant', text: receivedTokens }])
          }
          if (doneData?.conversation_id && setConversationId) {
            setConversationId(doneData.conversation_id)
          }
          if (onChatComplete) {
            onChatComplete()
          }
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        },
        onError: async (err) => {
          console.warn('[SSE Stream Error — falling back to non-streaming chat]', err)
          setIsStreaming(false)
          setStreamingText('')
          if (onSendMessage) {
            const reply = await onSendMessage(text)
            if (reply) {
              streamAssistantResponse(reply)
            }
          }
        }
      })
    } catch (err) {
      console.warn('[SSE Stream Failed — falling back to non-streaming chat]', err)
      setIsStreaming(false)
      setStreamingText('')
      if (onSendMessage) {
        const reply = await onSendMessage(text)
        if (reply) {
          streamAssistantResponse(reply)
        }
      }
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    handleSend()
  }

  const handleQuickPrompt = () => {
    if (isStreaming || isTyping) return
    const prompt = 'What tasks do I have coming up?'
    setInput(prompt)
    handleSend(prompt)
  }

  const handleNewChat = () => {
    if (isStreaming || isTyping) return
    setMessages([
      {
        role: 'assistant',
        text: "Hey! I'm Compass, your productivity copilot. I can track tasks, recall code context, synthesize cross-domain roadmaps, and search the web. What's on your mind?"
      }
    ])
    if (setConversationId) setConversationId(null)
  }

  /**
   * Preserves formatting, line breaks, bullet points, and router latency chips
   */
  const renderFormattedMessage = (text) => {
    if (!text) return null
    const lines = text.split('\n')

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {lines.map((line, i) => {
          const trimmed = line.trim()

          // 1. Router Latency Badge Chip (⚡ [Routed via Nemotron-3 Nano in 342ms])
          if (line.includes('Routed via Nemotron-3 Nano') || line.includes('⚡')) {
            return (
              <div key={i} className="router-chip">
                <span style={{ fontSize: '13px' }}>⚡</span>
                <span>{line.replace('⚡', '').trim()}</span>
              </div>
            )
          }

          // 2. Coursework Deliverables Heading
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

          // 3. Hackathon Deliverables Heading
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

          // 4. Actionable Next Step Callout
          if (line.includes('Next Step:')) {
            return (
              <div key={i} style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '10px', background: 'var(--bg-card-soft)', border: '1px solid var(--border)', color: 'var(--code-text)', fontSize: '12.5px', fontFamily: 'JetBrains Mono, monospace', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--code)' }}>❯</span>
                <span>{line}</span>
              </div>
            )
          }

          // 5. Bullet Points (• or -)
          if (trimmed.startsWith('•') || trimmed.startsWith('-')) {
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', margin: '3px 0 3px 6px', color: 'var(--text-primary)', fontSize: '13.5px' }}>
                <span style={{ color: 'var(--coursework)', fontWeight: '700', lineHeight: '1.4' }}>•</span>
                <span style={{ lineHeight: '1.5' }}>{trimmed.replace(/^[•\-]\s*/, '')}</span>
              </div>
            )
          }

          // 6. Empty Lines / Spacing
          if (!trimmed) {
            return <div key={i} style={{ height: '6px' }} />
          }

          // 7. Regular Text Paragraph
          return (
            <p key={i} style={{ margin: '2px 0', lineHeight: '1.6', color: 'var(--text-primary)' }}>
              {line}
            </p>
          )
        })}
      </div>
    )
  }

  const isInputDisabled = isStreaming || isTyping
  const isOnline = backendStatus.toLowerCase().includes('neon') || backendStatus.toLowerCase().includes('live')
  const overdueCount = tasks.filter(t => (t.countdown || '').toLowerCase().includes('overdue')).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100vh', minWidth: 0, background: 'var(--bg-app)' }}>
      {/* Header */}
      <div style={{
        padding: '18px 28px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '38px', height: '38px', borderRadius: '10px', background: 'var(--bg-sidebar)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', flexShrink: 0
          }}>
            🧭
          </div>
          <div>
            <div style={{ fontSize: '15.5px', fontWeight: '700', color: 'var(--text-primary)' }}>Compass Assistant</div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%',
                background: isOnline ? '#34d399' : '#f5a623', display: 'inline-block'
              }} />
              {isOnline ? 'Context loaded · Workspace aware' : 'Reconnecting to workspace…'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowContext(v => !v)}
            style={{
              padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--border)',
              background: showContext ? 'var(--hackathon-bg)' : 'var(--bg-card)',
              color: showContext ? 'var(--hackathon-text)' : 'var(--text-secondary)',
              fontSize: '12.5px', fontWeight: '600', cursor: 'pointer'
            }}>
            {showContext ? 'Hide Context' : 'Show Context'}
          </button>
          <button
            onClick={handleNewChat}
            disabled={isInputDisabled}
            style={{
              padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--border)',
              background: 'var(--bg-card)', color: 'var(--text-secondary)',
              fontSize: '12.5px', fontWeight: '600', cursor: isInputDisabled ? 'not-allowed' : 'pointer',
              opacity: isInputDisabled ? 0.5 : 1
            }}>
            New Chat
          </button>
        </div>
      </div>

      {/* Context chips — only real, wired data */}
      {showContext && (
        <div style={{
          display: 'flex', gap: '10px', padding: '14px 28px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-card)', flexShrink: 0, flexWrap: 'wrap'
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px', borderRadius: '10px',
            background: overdueCount > 0 ? 'var(--danger-bg)' : 'var(--code-bg)', minWidth: '180px'
          }}>
            <span style={{ fontSize: '16px' }}>{overdueCount > 0 ? '⚠️' : '✅'}</span>
            <div>
              <div style={{ fontSize: '12.5px', fontWeight: '700', color: overdueCount > 0 ? '#b23b3b' : 'var(--code-text)' }}>
                {overdueCount > 0 ? `${overdueCount} task${overdueCount === 1 ? '' : 's'} overdue` : 'No overdue tasks'}
              </div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Across all domains</div>
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px', borderRadius: '10px',
            background: 'var(--coursework-bg)', minWidth: '180px'
          }}>
            <span style={{ fontSize: '16px' }}>📋</span>
            <div>
              <div style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--coursework-text)' }}>
                {tasks.length} task{tasks.length === 1 ? '' : 's'} tracked
              </div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Live from Neon</div>
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px', borderRadius: '10px',
            background: isOnline ? 'var(--code-bg)' : 'var(--hackathon-bg)', minWidth: '180px'
          }}>
            <span style={{ fontSize: '16px' }}>{isOnline ? '🟢' : '🟡'}</span>
            <div>
              <div style={{ fontSize: '12.5px', fontWeight: '700', color: isOnline ? 'var(--code-text)' : 'var(--hackathon-text)' }}>
                {isOnline ? 'Backend live' : 'Backend offline'}
              </div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{backendStatus}</div>
            </div>
          </div>
        </div>
      )}

      {/* Message Feed Container */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '24px 28px', minWidth: 0 }}>
        <div className="serif-accent" style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '18px' }}>
          {getTimeGreeting()}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {messages.map((msg, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '10px', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {msg.role === 'assistant' && (
                <div style={{
                  width: '30px', height: '30px', borderRadius: '8px', background: 'var(--bg-sidebar)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0
                }}>
                  🧭
                </div>
              )}
              <div style={{
                maxWidth: '75%',
                padding: '13px 17px',
                borderRadius: '14px',
                background: msg.role === 'user' ? 'var(--bg-sidebar)' : 'var(--bg-card)',
                color: msg.role === 'user' ? 'var(--text-on-dark)' : 'var(--text-primary)',
                fontSize: '13.5px',
                lineHeight: '1.5',
                border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)'
              }}>
                {msg.role === 'user' ? msg.text : renderFormattedMessage(msg.text)}
              </div>
            </div>
          ))}

          {/* Active Progressive Token Streaming Bubble */}
          {isStreaming && (
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-start' }}>
              <div style={{
                width: '30px', height: '30px', borderRadius: '8px', background: 'var(--bg-sidebar)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0
              }}>
                🧭
              </div>
              <div style={{
                maxWidth: '75%',
                padding: '13px 17px',
                borderRadius: '14px',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                fontSize: '13.5px',
                lineHeight: '1.5',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-md)'
              }}>
                {renderFormattedMessage(streamingText)}
                <span className="streaming-caret" style={{ background: 'var(--coursework)' }} />
              </div>
            </div>
          )}

          {/* Loading Indicator */}
          {isTyping && !isStreaming && (
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px' }}>
              <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: 'var(--coursework)' }} />
              Thinking...
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Footer: quick prompt + input bar */}
      <div style={{ padding: '16px 28px 22px', background: 'var(--bg-app)', flexShrink: 0 }}>
        <div style={{ marginBottom: '10px' }}>
          <button
            type="button"
            onClick={handleQuickPrompt}
            disabled={isInputDisabled}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '10px 15px',
              borderRadius: '10px',
              background: isInputDisabled ? 'var(--bg-card-soft)' : 'var(--coursework-bg)',
              border: '1px solid var(--border)',
              color: isInputDisabled ? 'var(--text-muted)' : 'var(--coursework-text)',
              fontSize: '12.5px',
              cursor: isInputDisabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}>
            <span style={{ fontSize: '14px' }}>📋</span>
            <span>Quick prompt: <strong>"What tasks do I have coming up?"</strong></span>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isStreaming ? 'Streaming response...' : 'Ask me anything, or say "add a task"...'}
            disabled={isInputDisabled}
            style={{
              flex: 1,
              padding: '13px 17px',
              borderRadius: '10px',
              background: isInputDisabled ? 'var(--bg-card-soft)' : 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: isInputDisabled ? 'var(--text-muted)' : 'var(--text-primary)',
              fontSize: '13.5px',
              outline: 'none',
              cursor: isInputDisabled ? 'not-allowed' : 'text'
            }}
          />
          <button
            type="submit"
            disabled={isInputDisabled || !input.trim()}
            style={{
              padding: '0 24px',
              borderRadius: '10px',
              background: 'var(--brand)',
              border: 'none',
              color: '#2a1a00',
              fontWeight: '700',
              fontSize: '13px',
              cursor: (isInputDisabled || !input.trim()) ? 'not-allowed' : 'pointer',
              opacity: (!input.trim() || isInputDisabled) ? 0.5 : 1,
              transition: 'opacity 0.15s ease'
            }}>
            Send
          </button>
        </form>
      </div>
    </div>
  )
}