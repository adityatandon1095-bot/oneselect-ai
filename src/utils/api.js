import { supabase } from '../lib/supabase'

// All Claude calls are proxied through a Supabase edge function so the API
// key is never exposed in the browser bundle.
export async function callClaude(messages, systemPrompt, maxTokens = 1000) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/call-claude`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ messages, systemPrompt, maxTokens }),
    }
  )

  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || `API error ${res.status}`)
  return data.text
}
