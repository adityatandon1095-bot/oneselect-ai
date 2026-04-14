import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(u) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', u.id)
      .single()
    setProfile(data ?? null)
  }

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      if (session?.user) {
        setUser(session.user)
        // Fetch profile in background — don't block loading on it
        fetchProfile(session.user).catch(() => {})
      }
      // Unblock the UI immediately once we know the auth state
      setLoading(false)
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })

    // Hard fallback — should never be needed but guarantees we exit loading
    const timeout = setTimeout(() => {
      if (!cancelled) setLoading(false)
    }, 4000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user)
        fetchProfile(session.user).catch(() => {})
      } else {
        setUser(null)
        setProfile(null)
      }
    })

    return () => {
      cancelled = true
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
