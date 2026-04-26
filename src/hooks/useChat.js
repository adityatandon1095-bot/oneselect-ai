import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useChat(userId) {
  const [messages, setMessages] = useState([])
  const [loading,  setLoading]  = useState(false)
  const [sending,  setSending]  = useState(false)

  // Always holds the latest messages without causing stale closures in callbacks
  const msgsRef = useRef([])
  useEffect(() => { msgsRef.current = messages }, [messages])

  const loadMessages = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const { data } = await supabase
      .from('chat_history')
      .select('*')
      .eq('client_id', userId)
      .order('created_at', { ascending: true })
    setMessages(data ?? [])
    setLoading(false)
  }, [userId])

  const sendMessage = useCallback(async (text) => {
    if (!userId || !text.trim() || sending) return
    const trimmed = text.trim()
    const tempId  = `temp-${Date.now()}`

    // Optimistic insert
    setMessages(prev => [...prev, {
      id: tempId, role: 'user', message: trimmed,
      created_at: new Date().toISOString(), client_id: userId,
    }])
    setSending(true)

    try {
      // Persist user message
      const { data: savedUser } = await supabase
        .from('chat_history')
        .insert({ client_id: userId, role: 'user', message: trimmed })
        .select().single()

      if (savedUser) {
        setMessages(prev => prev.map(m => m.id === tempId ? savedUser : m))
      }

      // Conversation history = stored messages before this send (no temp/error entries)
      const history = msgsRef.current
        .filter(m => !String(m.id).startsWith('temp-') && !String(m.id).startsWith('err-'))
        .slice(-12)
        .map(m => ({ role: m.role, content: m.message }))

      // Call edge function
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
        .insert({ client_id: userId, role: 'assistant', message: data.response })
        .select().single()

      setMessages(prev => [...prev, savedAI ?? {
        id: `ai-${Date.now()}`, role: 'assistant',
        message: data.response, created_at: new Date().toISOString(),
      }])
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
  }, [userId, sending])

  const clearHistory = useCallback(async () => {
    if (!userId) return
    await supabase.from('chat_history').delete().eq('client_id', userId)
    setMessages([])
  }, [userId])

  return { messages, loading, sending, loadMessages, sendMessage, clearHistory }
}
