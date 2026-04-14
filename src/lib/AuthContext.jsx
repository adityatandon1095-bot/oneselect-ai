import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]                     = useState(null)
  const [profile, setProfile]               = useState(null)
  const [loading, setLoading]               = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)

  async function fetchProfile(u) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', u.id)
        .single()
      setProfile(data ?? null)
    } finally {
      setProfileLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      if (session?.user) {
        setUser(session.user)
        setProfileLoading(true)
        fetchProfile(session.user).catch(() => { setProfileLoading(false) })
      }
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
        setProfileLoading(true)
        fetchProfile(session.user).catch(() => { setProfileLoading(false) })
      } else {
        setUser(null)
        setProfile(null)
        setProfileLoading(false)
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
    <AuthContext.Provider value={{ user, profile, profileLoading, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
