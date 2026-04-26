import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { useChat } from '../../hooks/useChat'

function getDateLabel(dateStr) {
  const d         = new Date(dateStr)
  const now       = new Date()
  const yesterday = new Date(now.getTime() - 86400000)
  if (d.toDateString() === now.toDateString())       return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  })
}

function renderMarkdown(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
}

const SUGGESTIONS = [
  'Who is my strongest candidate right now?',
  "What's the overall health of my hiring pipeline?",
  'Compare my top candidates for the most active role',
  'What are common interview red flags to watch for?',
  'How can I reduce my time-to-hire?',
  'What salary range is competitive for my open roles?',
]

export default function ClientChat() {
  const { user } = useAuth()
  const [input,        setInput]        = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef       = useRef(null)

  const { messages, loading, sending, loadMessages, sendMessage, clearHistory } = useChat(user?.id)

  useEffect(() => { loadMessages() }, [loadMessages])

  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: messages.length === 1 ? 'instant' : 'smooth' })
    }
  }, [messages, sending])

  const handleSend = async () => {
    if (!input.trim() || sending) return
    const text = input.trim()
    setInput('')
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.focus()
    }
    await sendMessage(text)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleTextareaChange = (e) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  const handleClear = async () => {
    await clearHistory()
    setConfirmClear(false)
    inputRef.current?.focus()
  }

  // Build item list with date separators inserted between day groups
  const items = []
  let lastDate = null
  for (const msg of messages) {
    const label = getDateLabel(msg.created_at)
    if (label !== lastDate) {
      items.push({ type: 'sep', label, id: `sep-${msg.id}` })
      lastDate = label
    }
    items.push({ type: 'msg', msg, id: String(msg.id) })
  }

  return (
    <div className="hchat-page">
      {/* ── Header ── */}
      <div className="hchat-page-head">
        <div>
          <h2>AI Hiring Assistant</h2>
          <p>Ask about your pipeline, candidates, or get expert hiring advice</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {messages.length > 0 && !confirmClear && (
            <button className="btn btn-secondary" onClick={() => setConfirmClear(true)}>
              New Conversation
            </button>
          )}
          {confirmClear && (
            <>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Clear all history?</span>
              <button
                className="btn btn-secondary"
                style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                onClick={handleClear}
              >
                Clear
              </button>
              <button className="btn btn-secondary" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="hchat-page-msgs">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
            <span className="spinner" style={{ width: 24, height: 24 }} />
          </div>
        ) : messages.length === 0 ? (
          <div className="hchat-empty" style={{ flex: 1, padding: '48px 24px' }}>
            <div className="hchat-empty-icon" style={{ fontSize: 44 }}>◎</div>
            <h4 style={{
              fontSize: 22, fontFamily: 'var(--font-head)', fontWeight: 400,
              marginBottom: 8, color: 'var(--text)', textTransform: 'none', letterSpacing: 0,
            }}>
              Your AI Hiring Advisor
            </h4>
            <p style={{ fontSize: 14, maxWidth: 440, lineHeight: 1.7, marginBottom: 32 }}>
              I have live access to your pipeline, candidate scores, and interview data.
              Ask me anything.
            </p>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
              width: '100%', maxWidth: 480,
            }}>
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  className="hchat-suggestion"
                  style={{ fontSize: 13, padding: '10px 14px' }}
                  onClick={() => { setInput(s); inputRef.current?.focus() }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          items.map(item =>
            item.type === 'sep' ? (
              <div key={item.id} className="hchat-date-sep">
                <span>{item.label}</span>
              </div>
            ) : (
              <div key={item.id} className={`hchat-row ${item.msg.role}`}>
                <div className="hchat-row-av" style={{ width: 30, height: 30, fontSize: 9 }}>
                  {item.msg.role === 'assistant' ? 'OS' : 'You'}
                </div>
                <div
                  className="hchat-bubble-msg"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(item.msg.message) }}
                />
              </div>
            )
          )
        )}

        {sending && (
          <div className="hchat-typing-row">
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'var(--accent)', color: '#fff', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-mono)', fontSize: 9,
            }}>OS</div>
            <div className="hchat-typing-bubble">
              <div className="typing-dots"><span /><span /><span /></div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ── */}
      <div className="hchat-page-input">
        <textarea
          ref={inputRef}
          className="hchat-input"
          value={input}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your candidates, pipeline health, or get hiring advice… (Enter to send, Shift+Enter for new line)"
          rows={1}
          autoFocus
        />
        <button
          className="hchat-send"
          onClick={handleSend}
          disabled={!input.trim() || sending}
          style={{ width: 42, height: 42, borderRadius: 8 }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M16 9H2M16 9L10 3M16 9L10 15" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
