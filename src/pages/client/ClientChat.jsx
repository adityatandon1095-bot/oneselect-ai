import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { useChat } from '../../hooks/useChat'

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
  'Which candidates are awaiting my decision?',
  'How can I reduce my time-to-hire?',
  'Summarise notice periods across my shortlist',
]

export default function ClientChat() {
  const { user } = useAuth()
  const [input,       setInput]       = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef       = useRef(null)

  const {
    conversations, activeId, messages, loading, sending, convsLoading,
    loadConversations, createConversation, switchConversation,
    deleteConversation, clearCurrentConversation, sendMessage,
  } = useChat(user?.id)

  useEffect(() => {
    if (!user?.id) return
    loadConversations().then(convs => {
      if (convs?.length) switchConversation(convs[0].id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const handleNew = async () => {
    await createConversation()
    setSidebarOpen(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleSwitch = async (id) => {
    await switchConversation(id)
    setSidebarOpen(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    const idx      = conversations.findIndex(c => c.id === id)
    const wasActive = id === activeId
    await deleteConversation(id)
    if (wasActive) {
      const remaining = conversations.filter(c => c.id !== id)
      if (remaining.length > 0) await switchConversation(remaining[Math.min(idx, remaining.length - 1)].id)
      else clearCurrentConversation()
    }
  }

  const handleSend = async () => {
    if (!input.trim() || sending) return
    const text = input.trim()
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    await sendMessage(text)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleTextareaChange = (e) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  return (
    <div className="client-chat-wrap">
      {sidebarOpen && (
        <div className="client-chat-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Conversation sidebar ── */}
      <div className={`chat-side${sidebarOpen ? ' open' : ''}`}>
        <div className="chat-side-top">
          <button className="chat-new" onClick={handleNew}>+ New chat</button>
        </div>
        <div className="chat-convs">
          {convsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
              <span className="spinner" style={{ width: 14, height: 14 }} />
            </div>
          ) : conversations.length === 0 ? (
            <p style={{ padding: '14px 12px', fontSize: 12, color: 'var(--text-3)', fontWeight: 300 }}>
              No conversations yet.
            </p>
          ) : conversations.map(conv => (
            <div
              key={conv.id}
              className={`chat-conv${conv.id === activeId ? ' active' : ''}`}
              onClick={() => handleSwitch(conv.id)}
            >
              <div className="cc-t">{conv.title}</div>
              <div className="cc-d">
                {new Date(conv.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main chat area ── */}
      <div className="chat-main">
        {/* Head */}
        <div className="chat-head">
          <button
            className="chat-mobile-menu"
            onClick={() => setSidebarOpen(o => !o)}
            aria-label="Conversations"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M2 8h12M2 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          <div className="chat-av">OS</div>
          <div>
            <strong>One Select Assistant</strong>
            <span>Pipeline copilot · always on</span>
          </div>
        </div>

        {/* Messages */}
        <div className="chat-msgs">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
              <span className="spinner" style={{ width: 24, height: 24 }} />
            </div>
          ) : messages.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: 44, opacity: 0.18, marginBottom: 16 }}>◎</div>
              <h3 style={{ fontFamily: 'var(--font-head)', fontSize: 22, fontWeight: 400, marginBottom: 8, color: 'var(--text)' }}>
                Your AI Hiring Advisor
              </h3>
              <p style={{ fontSize: 14, color: 'var(--text-3)', maxWidth: 440, lineHeight: 1.7, marginBottom: 0 }}>
                I have live access to your pipeline, candidate scores, and interview data. Ask me anything.
              </p>
            </div>
          ) : (
            messages.map(msg => (
              <div key={msg.id} className={`crow ${msg.role === 'user' ? 'user' : 'bot'}`}>
                <div className="crow-av">{msg.role === 'user' ? 'You' : 'OS'}</div>
                <div
                  className="cbubble"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.message) }}
                />
              </div>
            ))
          )}

          {sending && (
            <div className="crow bot">
              <div className="crow-av">OS</div>
              <div className="cbubble">
                <div className="typing-dots"><span /><span /><span /></div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions — shown only on empty state */}
        {messages.length === 0 && !loading && (
          <div className="chat-suggest">
            {SUGGESTIONS.map(s => (
              <button key={s} className="sug" onClick={() => { setInput(s); inputRef.current?.focus() }}>
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input bar */}
        <div className="chat-input-bar">
          <textarea
            ref={inputRef}
            className="chat-input"
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your candidates, jobs, or pipeline…"
            rows={1}
            autoFocus
          />
          <button className="chat-send" onClick={handleSend} disabled={!input.trim() || sending}>
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}
