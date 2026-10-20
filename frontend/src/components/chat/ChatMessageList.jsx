import React, { useMemo, useState, useEffect } from 'react'
import EvidenceCard from './EvidenceCard'
import ThinkingBlock from './ThinkingBlock'
import MarkdownRenderer from './MarkdownRenderer'
import ChatTaskCard from './ChatTaskCard'
import { fetchPersonaPhrases } from '../../api/chatApi'

const DEFAULT_STARTING_PHRASES = [
  "Where should we begin?",
  "Ready when you are.",
  "Pick a direction, or just start talking and we'll find one.",
  "No wrong place to start. What's pulling at you?",
  "Half-formed thoughts welcome.",
  "Take your time. I'm not going anywhere.",
]

const DEFAULT_RETURNING_PHRASES = [
  "You returned! Want to pick up where we left off, or start somewhere new?",
  "Welcome back. What changed since last time?",
  "Good to see you again. Where shall we dive in?",
  "Ready to pick up the thread, or start somewhere fresh?",
]

const SUGGESTION_CHIPS = [
  "Let's noodle on something",
  "What's due this week?",
  "Recap where I left off",
]

function getFollowUpSuggestions(text) {
  if (!text || typeof text !== 'string') return []
  const lower = text.toLowerCase()
  if (lower.includes('roadmap') || lower.includes('plan for today') || lower.includes('start here') || lower.includes('suggested schedule')) {
    return [
      'Show overdue tasks',
      'Build my schedule',
      'Focus on coursework',
      'Check calendar clashes',
    ]
  }
  if (lower.includes('task') || lower.includes('deadline')) {
    return [
      'Plan an optimal roadmap for today',
      'Show overdue tasks',
      'Check schedule conflicts',
    ]
  }
  return [
    'What should I do today?',
    'Review my upcoming tasks',
  ]
}

function getTimeGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function getEmptyStateGreeting(isReturning, userName, startingPool = DEFAULT_STARTING_PHRASES, returningPool = DEFAULT_RETURNING_PHRASES) {
  const pool = (isReturning ? returningPool : startingPool) || DEFAULT_STARTING_PHRASES
  const storageKey = isReturning ? 'compass_last_returning_phrase_idx' : 'compass_last_starting_phrase_idx'
  let lastIdx = -1
  try {
    const val = localStorage.getItem(storageKey)
    if (val !== null) lastIdx = parseInt(val, 10)
  } catch {
    /* ignore storage access error */
  }

  let candidates = pool.map((_, i) => i).filter(i => isNaN(lastIdx) || i !== lastIdx)
  if (candidates.length === 0) candidates = pool.map((_, i) => i)

  const chosenIdx = candidates[Math.floor(Math.random() * candidates.length)]
  try {
    localStorage.setItem(storageKey, String(chosenIdx))
  } catch {
    /* ignore storage access error */
  }

  let phrase = pool[chosenIdx] || pool[0] || "Where should we begin?"

  if (userName && isReturning) {
    if (phrase.includes("Welcome back.")) {
      phrase = `Welcome back, ${userName}. What changed since last time?`
    } else if (phrase.includes("You returned!")) {
      phrase = `Welcome back, ${userName}! Want to pick up where we left off, or start somewhere new?`
    } else if (phrase.includes("Good to see you again.")) {
      phrase = `Good to see you again, ${userName}. Where shall we dive in?`
    }
  }

  // 15% chance of subtle time-aware touch
  if (Math.random() < 0.15) {
    const hour = new Date().getHours()
    let touch = null
    if (hour >= 23 || hour < 5) touch = "Burning the midnight oil."
    else if (hour >= 5 && hour < 8) touch = "Early start today."
    else if (hour >= 8 && hour < 12) touch = "Morning focus."
    else if (hour >= 18 && hour < 23) touch = "Evening unwind."
    if (touch) {
      phrase = `${touch} ${phrase}`
    }
  }

  return phrase
}


export default function ChatMessageList({
  messages,
  isStreaming,
  streamingText,
  streamingThought = '',
  streamingStatus = null,
  isTyping,
  messagesEndRef,
  profileFacts = {},
  pastConversations = [],
  onSendMessage,
  onSelectMode,
  onRetry,
}) {
  const [startingPhrases, setStartingPhrases] = useState(DEFAULT_STARTING_PHRASES)
  const [returningPhrases, setReturningPhrases] = useState(DEFAULT_RETURNING_PHRASES)

  useEffect(() => {
    let isMounted = true
    fetchPersonaPhrases().then((data) => {
      if (!isMounted || !data) return
      if (Array.isArray(data.starting_phrases) && data.starting_phrases.length > 0) {
        setStartingPhrases(data.starting_phrases)
      }
      if (Array.isArray(data.returning_phrases) && data.returning_phrases.length > 0) {
        setReturningPhrases(data.returning_phrases)
      }
    }).catch(() => {})
    return () => {
      isMounted = false
    }
  }, [])

  const isReturning = Boolean(
    (pastConversations && pastConversations.length > 0) ||
    (profileFacts && (profileFacts.name || Object.keys(profileFacts).length > 0))
  )
  const userName = profileFacts?.name || null

  const greeting = useMemo(() => {
    return getEmptyStateGreeting(isReturning, userName, startingPhrases, returningPhrases)
  }, [isReturning, userName, startingPhrases, returningPhrases])

  const showEmptyState = messages.length === 0 && !isStreaming

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '24px 28px', minWidth: 0 }}>
      {showEmptyState ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 'auto 0',
          padding: '40px 20px',
          textAlign: 'center',
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '26px',
            marginBottom: '18px',
            boxShadow: 'var(--shadow-sm)',
          }}>
            🧭
          </div>

          <h2 className="serif-accent" style={{
            fontSize: '22px',
            fontWeight: '600',
            color: 'var(--text-primary)',
            marginBottom: '10px',
            maxWidth: '560px',
            lineHeight: '1.4',
          }}>
            {greeting}
          </h2>

          <p style={{
            fontSize: '13.5px',
            color: 'var(--text-secondary)',
            marginBottom: '26px',
            maxWidth: '480px',
            lineHeight: '1.5',
          }}>
            {userName
              ? `I have your personal context and preferences loaded. Think out loud, plan your week, or pick a direction.`
              : `Your warm thinking partner for coursework, deadlines, and hackathons. No wrong place to start.`
            }
          </p>

          {/* Suggestion Chips */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            justifyContent: 'center',
            maxWidth: '520px',
          }}>
            {SUGGESTION_CHIPS.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSendMessage && onSendMessage(chip)}
                className="persona-suggestion-chip"
              >
                <span style={{ color: 'var(--coursework)', fontSize: '14px' }}>✦</span>
                <span>{chip}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="serif-accent" style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '18px' }}>
            {getTimeGreeting()}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {messages.map((msg, idx) => {
              const hasModes = msg.role === 'assistant' && typeof msg.text === 'string' && msg.text.includes('[[modes]]')
              const isLatest = idx === messages.length - 1
              const showModes = hasModes && isLatest && !isStreaming

              return (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', width: '100%' }}>
                    {msg.role === 'assistant' && (
                      <div className="chat-msg-avatar" style={{
                        width: '30px', height: '30px', borderRadius: '8px', background: 'var(--bg-sidebar)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0
                      }}>
                        🧭
                      </div>
                    )}
                    <div className="chat-msg-bubble" style={{
                      maxWidth: 'min(85%, 820px)',
                      padding: '13px 17px',
                      borderRadius: '14px',
                      background: msg.role === 'user' ? 'var(--bg-sidebar)' : 'var(--bg-card)',
                      color: msg.role === 'user' ? 'var(--text-on-dark)' : 'var(--text-primary)',
                      fontSize: '13.5px',
                      lineHeight: '1.5',
                      border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
                      boxShadow: 'var(--shadow-sm)'
                    }}>
                      {msg.role === 'assistant' && msg.thought && (
                        <ThinkingBlock thought={msg.thought} />
                      )}
                      {msg.role === 'user' ? (
                        msg.text
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {msg.text ? <MarkdownRenderer content={msg.text} /> : null}
                          {msg.error && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: msg.text ? '6px' : '0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger, #ef4444)', fontSize: '13px' }}>
                                <span>⚠️</span>
                                <span>{msg.error}</span>
                              </div>
                              {msg.canRetry && msg.retryPrompt && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (onRetry) {
                                      onRetry(idx, msg.retryPrompt)
                                    } else if (onSendMessage) {
                                      onSendMessage(msg.retryPrompt)
                                    }
                                  }}
                                  style={{
                                    alignSelf: 'flex-start',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '5px 12px',
                                    borderRadius: '6px',
                                    background: 'var(--bg-card-soft, rgba(0,0,0,0.05))',
                                    border: '1px solid var(--border)',
                                    color: 'var(--text-primary)',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    fontWeight: '500',
                                  }}
                                >
                                  <span>🔄</span>
                                  <span>Retry</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {msg.role === 'assistant' && msg.tasks && Array.isArray(msg.tasks) && msg.tasks.length > 0 && (
                        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Relevant Tasks ({msg.tasks.length})
                          </span>
                          {msg.tasks.slice(0, 4).map((t, tIdx) => (
                            <ChatTaskCard key={tIdx} task={t} onAction={(action, task) => onSendMessage && onSendMessage(`View task "${task.title}"`)} />
                          ))}
                        </div>
                      )}
                      {msg.role === 'assistant' && msg.evidence && (
                        <EvidenceCard evidence={msg.evidence} />
                      )}
                    </div>
                  </div>

                  {/* Contextual Follow-up Chips for Latest Assistant Response */}
                  {isLatest && msg.role === 'assistant' && !isStreaming && !msg.error && (
                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      marginLeft: '40px',
                      marginTop: '2px',
                      flexWrap: 'wrap',
                    }}>
                      {getFollowUpSuggestions(msg.text).map((chip, cIdx) => (
                        <button
                          key={cIdx}
                          type="button"
                          disabled={isStreaming || isTyping}
                          onClick={() => onSendMessage && onSendMessage(chip)}
                          className="persona-suggestion-chip"
                          style={{
                            padding: '4px 10px',
                            fontSize: '12px',
                            borderRadius: '16px',
                            background: 'var(--bg-card-soft, rgba(0,0,0,0.04))',
                            border: '1px solid var(--border)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          <span style={{ color: 'var(--coursework, #3b82f6)' }}>✦</span>
                          <span>{chip}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {showModes && (
                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      marginLeft: '40px',
                      flexWrap: 'wrap',
                    }}>
                      <button
                        type="button"
                        className="mode-quick-btn"
                        onClick={() => onSelectMode ? onSelectMode('advice', 'Advice') : onSendMessage && onSendMessage('Advice')}
                      >
                        💡 Advice
                      </button>
                      <button
                        type="button"
                        className="mode-quick-btn"
                        onClick={() => onSelectMode ? onSelectMode('sounding_board', 'Sounding board') : onSendMessage && onSendMessage('Sounding board')}
                      >
                        👂 Sounding board
                      </button>
                      <button
                        type="button"
                        className="mode-quick-btn"
                        onClick={() => onSelectMode ? onSelectMode('plan', 'Plan') : onSendMessage && onSendMessage('Plan')}
                      >
                        📋 Plan
                      </button>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Active Progressive Token Streaming Bubble */}
            {isStreaming && (
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-start' }}>
                <div className="chat-msg-avatar" style={{
                  width: '30px', height: '30px', borderRadius: '8px', background: 'var(--bg-sidebar)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0
                }}>
                  🧭
                </div>
                <div className="chat-msg-bubble" style={{
                  maxWidth: 'min(85%, 820px)',
                  padding: '13px 17px',
                  borderRadius: '14px',
                  background: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  fontSize: '13.5px',
                  lineHeight: '1.5',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-md)'
                }}>
                  {(streamingThought || !streamingText) && (
                    <ThinkingBlock thought={streamingThought} status={streamingStatus} isLive={true} />
                  )}
                  {streamingText ? (
                    <>
                      <MarkdownRenderer content={streamingText} />
                      <span className="streaming-caret" style={{ background: 'var(--coursework)' }} />
                    </>
                  ) : null}
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
        </>
      )}
    </div>
  )
}

