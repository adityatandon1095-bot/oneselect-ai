import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

// Detect Supabase invite/recovery tokens in the URL before any auth init.
// When present, we must sign out any existing session so the invite is
// processed as the invited user, not whoever is currently logged in.
const _urlHash   = new URLSearchParams(window.location.hash.slice(1))
const _urlSearch = new URLSearchParams(window.location.search)
const _urlType   = _urlHash.get('type') || _urlSearch.get('type')
const HAS_INVITE_TOKEN = (_urlType === 'invite' || _urlType === 'recovery') &&
  !!(_urlHash.get('access_token') || _urlSearch.get('code'))

export function AuthProvider({ children }) {
  const [user, setUser]                     = useState(null)
  const [profile, setProfile]               = useState(null)
  const [loading, setLoading]               = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)

  async function fetchProfile(u) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', u.id)
        .single()
      if (error) throw error
      setProfile(data ?? null)
    } catch {
      // Profile may be missing on first invite — not fatal
      setProfile(null)
    } finally {
      setProfileLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function init() {
      // If an invite or recovery token is in the URL, sign out any existing
      // session first so the token is processed as the invited user, not
      // whoever is already logged in (e.g. a demo/admin account).
      if (HAS_INVITE_TOKEN) {
        await supabase.auth.signOut()
        if (!cancelled) setLoading(false)
        return  // onAuthStateChange handles the SIGNED_IN from the URL token
      }

      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return
        if (session?.user) {
          setUser(session.user)
          setProfileLoading(true)
          fetchProfile(session.user).catch(() => { if (!cancelled) setProfileLoading(false) })
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()

    // Hard fallback — prevents infinite loading if getSession hangs
    const timeout = setTimeout(() => {
      if (!cancelled) setLoading(false)
    }, 4000)

    // Listen for auth state changes.
    // IMPORTANT: only trigger a profile re-fetch on genuine sign-in events.
    // TOKEN_REFRESHED fires every ~50 min and on tab focus — we must NOT set
    // profileLoading=true there, or returning to the tab resets the UI.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return

      if (event === 'SIGNED_OUT') {
        setUser(null)
        setProfile(null)
        setProfileLoading(false)
        return
      }

      if (!session?.user) return

      if (event === 'SIGNED_IN') {
        // Genuine login — full re-init including profile fetch
        setUser(session.user)
        setProfileLoading(true)
        fetchProfile(session.user).catch(() => { if (!cancelled) setProfileLoading(false) })
        return
      }

      // TOKEN_REFRESHED, USER_UPDATED, INITIAL_SESSION, PASSWORD_RECOVERY, etc.
      // Just keep the user object current — don't disturb profile or trigger loading
      setUser(session.user)
    })

    return () => {
      cancelled = true
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    // Clear all app-specific draft and session keys from localStorage
    try {
      const keysToRemove = Object.keys(localStorage).filter(k =>
        k.startsWith('os_') ||
        k.startsWith('welcomed_') ||
        k.startsWith('pw_set_')
      )
      keysToRemove.forEach(k => localStorage.removeItem(k))
    } catch { /* ignore storage errors */ }
    // scope: 'global' invalidates the refresh token server-side, preventing
    // session reuse from any other tab or device
    await supabase.auth.signOut({ scope: 'global' })
  }

  // For client portal: use parent client's ID if this user is a stakeholder
  const effectiveClientId = profile?.stakeholder_of ?? user?.id ?? null
  const isStakeholder = !!profile?.stakeholder_of

  return (
    <AuthContext.Provider value={{ user, profile, profileLoading, loading, signOut, effectiveClientId, isStakeholder }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
