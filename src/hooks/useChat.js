import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function makeTitle(text) {
  const t = String(text ?? '').trim()
  return t.length <= 40 ? t : t.slice(0, 37) + '...'
}

export function useChat(userId) {
  const [conversations, setConversations] = useState([])
  const [activeId,      setActiveId]      = useState(null)
  const [messages,      setMessages]      = useState([])
  const [loading,       setLoading]       = useState(false)
  const [sending,       setSending]       = useState(false)
  const [convsLoading,  setConvsLoading]  = useState(false)

  // Refs to avoid stale closures in async callbacks
  const msgsRef      = useRef([])
  const sendingRef   = useRef(false)
  const activeIdRef  = useRef(null)

  useEffect(() => { msgsRef.current     = messages }, [messages])
  useEffect(() => { sendingRef.current  = sending  }, [sending])
  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  // ── Load all conversations (returns array for immediate use) ──────────
  const loadConversations = useCallback(async () => {
    if (!userId) return []
    setConvsLoading(true)
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('client_id', userId)
      .order('updated_at', { ascending: false })
    const convs = data ?? []
    setConversations(convs)
    setConvsLoading(false)
    return convs
  }, [userId])

  // ── Load messages for a specific conversation ─────────────────────────
  const switchConversation = useCallback(async (id) => {
    setActiveId(id)
    setLoading(true)
    const { data } = await supabase
      .from('chat_history')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
    setMessages(data ?? [])
    setLoading(false)
  }, [])

  // ── For ChatBubble: load most-recent conv (creates one if none) ───────
  const loadMessages = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const { data: convs } = await supabase
      .from('conversations')
      .select('*')
      .eq('client_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)

    let convId
    if (convs?.length) {
      convId = convs[0].id
      setConversations(prev =>
        prev.some(c => c.id === convId) ? prev : [convs[0], ...prev]
      )
    } else {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({ client_id: userId, title: 'New Conversation' })
        .select().single()
      if (newConv) {
        setConversations([newConv])
        convId = newConv.id
      }
    }

    setActiveId(convId ?? null)

    if (convId) {
      const { data: msgs } = await supabase
        .from('chat_history')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true })
      setMessages(msgs ?? [])
    }
    setLoading(false)
  }, [userId])

  // ── Create a new conversation ─────────────────────────────────────────
  const createConversation = useCallback(async () => {
    if (!userId) return null
    const { data } = await supabase
      .from('conversations')
      .insert({ client_id: userId, title: 'New Conversation' })
      .select().single()
    if (data) {
      setConversations(prev => [data, ...prev])
      setActiveId(data.id)
      setMessages([])
    }
    return data
  }, [userId])

  // ── Delete a conversation ─────────────────────────────────────────────
  const deleteConversation = useCallback(async (id) => {
    await supabase.from('conversations').delete().eq('id', id)
    setConversations(prev => prev.filter(c => c.id !== id))
  }, [])

  // ── Clear current conversation state (for UI after deleting last) ─────
  const clearCurrentConversation = useCallback(() => {
    setActiveId(null)
    setMessages([])
  }, [])

  // ── Send a message ────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    if (!userId || !text.trim() || sendingRef.current) return

    const trimmed = text.trim()

    // Capture isFirstAI before any state changes
    const isFirstAI = !msgsRef.current.some(
      m => m.role === 'assistant' && !String(m.id).startsWith('err-')
    )

    // Auto-create conversation if none is active
    let convId = activeIdRef.current
    if (!convId) {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({ client_id: userId, title: 'New Conversation' })
        .select().single()
      if (!newConv) return
      convId = newConv.id
      activeIdRef.current = convId
      setActiveId(convId)
      setConversations(prev => [newConv, ...prev])
    }

    const tempId = `temp-${Date.now()}`
    setMessages(prev => [...prev, {
      id: tempId, role: 'user', message: trimmed,
      created_at: new Date().toISOString(), client_id: userId,
      conversation_id: convId,
    }])
    setSending(true)

    try {
      // Persist user message
      const { data: savedUser } = await supabase
        .from('chat_history')
        .insert({ client_id: userId, role: 'user', message: trimmed, conversation_id: convId })
        .select().single()
      if (savedUser) {
        setMessages(prev => prev.map(m => m.id === tempId ? savedUser : m))
      }

      // History for AI context (last 12 non-temp, non-error messages)
      const history = msgsRef.current
        .filter(m => !String(m.id).startsWith('temp-') && !String(m.id).startsWith('err-'))
        .slice(-12)
        .map(m => ({ role: m.role, content: m.message }))

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hiring-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ message: trimmed, conversation_history: history }),
        }
      )

      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'AI response failed')

      // Persist AI response
      const { data: savedAI } = await supabase
        .from('chat_history')
        .insert({ client_id: userId, role: 'assistant', message: data.response, conversation_id: convId })
        .select().single()

      setMessages(prev => [...prev, savedAI ?? {
        id: `ai-${Date.now()}`, role: 'assistant',
        message: data.response, created_at: new Date().toISOString(),
      }])

      // Auto-title on first AI response; otherwise bump updated_at
      if (isFirstAI) {
        const title = makeTitle(trimmed)
        await supabase
          .from('conversations')
          .update({ title, updated_at: new Date().toISOString() })
          .eq('id', convId)
        setConversations(prev => prev.map(c => c.id === convId ? { ...c, title } : c))
      } else {
        const now = new Date().toISOString()
        supabase.from('conversations').update({ updated_at: now }).eq('id', convId).then()
        setConversations(prev => {
          const conv = prev.find(c => c.id === convId)
          if (!conv) return prev
          return [{ ...conv, updated_at: now }, ...prev.filter(c => c.id !== convId)]
        })
      }

    } catch (err) {
      console.error('Chat send error:', err)
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`, role: 'assistant',
        message: 'Something went wrong, please try again.',
        created_at: new Date().toISOString(), isError: true,
      }])
    } finally {
      setSending(false)
    }
  }, [userId])

  return {
    conversations, activeId, messages, loading, sending, convsLoading,
    loadConversations, loadMessages, createConversation,
    switchConversation, deleteConversation, clearCurrentConversation, sendMessage,
  }
}
