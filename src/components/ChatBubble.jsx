import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useChat } from '../hooks/useChat'

const SUGGESTIONS = [
  'Who is my strongest candidate right now?',
  "What's the health of my hiring pipeline?",
  'What interview questions should I ask for my open roles?',
]

function renderMarkdown(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
}

export default function ChatBubble() {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [isOpen, setIsOpen]   = useState(false)
  const [input,  setInput]    = useState('')
  const messagesEndRef = useRef(null)
  const inputRef       = useRef(null)
  const loadedRef      = useRef(false)

  const { messages, loading, sending, loadMessages, sendMessage } = useChat(user?.id)

  // Load messages when drawer first opens
  useEffect(() => {
    if (isOpen && !loadedRef.current) {
      loadedRef.current = true
      loadMessages()
    }
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 220)
    }
  }, [isOpen, loadMessages])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (isOpen) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending, isOpen])

  const handleSend = async () => {
    if (!input.trim() || sending) return
    const text = input.trim()
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    await sendMessage(text)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleTextareaChange = (e) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px'
  }

  // Don't show bubble on the full chat page
  if (location.pathname === '/client/chat') return null

  return createPortal(
    <>
      {/* ── Slide-up chat drawer ── */}
      <div className={`hchat-drawer ${isOpen ? 'open' : 'closed'}`}>
        <div className="hchat-head">
          <div className="hchat-head-av">OS</div>
          <div className="hchat-head-info">
            <strong>AI Hiring Assistant</strong>
            <span>One Select · Powered by AI</span>
          </div>
          <div className="hchat-head-btns">
            <button
              className="hchat-icon-btn"
              title="Open full conversation"
              onClick={() => { setIsOpen(false); navigate('/client/chat') }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M8.5 1.5H12.5V5.5M5.5 8.5L12.5 1.5M1.5 5.5V12.5H8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button className="hchat-icon-btn" title="Close" onClick={() => setIsOpen(false)}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="hchat-messages">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
              <span className="spinner" />
            </div>
          ) : messages.length === 0 ? (
            <div className="hchat-empty">
              <div className="hchat-empty-icon">◎</div>
              <h4>Ask me anything</h4>
              <p>I have live access to your pipeline, candidate scores, and interview data.</p>
              <div className="hchat-suggestions">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    className="hchat-suggestion"
                    onClick={() => { setInput(s); inputRef.current?.focus() }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map(msg => (
              <div key={msg.id} className={`hchat-row ${msg.role}`}>
                <div className="hchat-row-av">{msg.role === 'assistant' ? 'OS' : 'You'}</div>
                <div
                  className="hchat-bubble-msg"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.message) }}
                />
              </div>
            ))
          )}
          {sending && (
            <div className="hchat-typing-row">
              <div className="hchat-row-av" style={{ background: 'var(--accent)', color: '#fff', width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 8 }}>OS</div>
              <div className="hchat-typing-bubble">
                <div className="typing-dots"><span /><span /><span /></div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="hchat-input-area">
          <textarea
            ref={inputRef}
            className="hchat-input"
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your pipeline…"
            rows={1}
          />
          <button
            className="hchat-send"
            onClick={handleSend}
            disabled={!input.trim() || sending}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M14 8H2M14 8L9 3M14 8L9 13" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Floating bubble button ── */}
      <button
        className="hchat-bubble"
        onClick={() => setIsOpen(o => !o)}
        title="AI Hiring Assistant"
        style={{ position: 'fixed' }}
      >
        <div className="hchat-bubble-pulse" />
        {isOpen ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 2l14 14M16 2L2 16" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M3 3h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6l-4 3V4a1 1 0 0 1 1-1z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>
    </>,
    document.body
  )
}
