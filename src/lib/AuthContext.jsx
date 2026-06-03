import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

// Detect Supabase token type in the URL before any auth init.
// The three PKCE flows each need distinct handling in init():
//   type=invite    → sign out first so invited user's session isn't layered on top of an existing one
//   type=recovery  → don't sign out (would clear PKCE verifier); let SDK exchange code → PASSWORD_RECOVERY
//   type=magiclink → treat as normal login; let SDK exchange code → SIGNED_IN → redirect to dashboard
//   (no type)      → also treated as magic link / normal code exchange
const _urlHash   = new URLSearchParams(window.location.hash.slice(1))
const _urlSearch = new URLSearchParams(window.location.search)
const _urlType   = _urlHash.get('type') || _urlSearch.get('type')
const _hasToken  = !!(_urlHash.get('access_token') || _urlSearch.get('code'))
const HAS_INVITE_TOKEN    = (_urlType === 'invite')   && _hasToken
const HAS_RECOVERY_TOKEN  = (_urlType === 'recovery') && _hasToken
// Magic link: type=magiclink, or a bare ?code= with no type param.
// Neither HAS_INVITE_TOKEN nor HAS_RECOVERY_TOKEN will match these — they
// fall through to the normal getSession() path in init(), which is correct.
const HAS_MAGIC_LINK_TOKEN = _hasToken && !HAS_INVITE_TOKEN && !HAS_RECOVERY_TOKEN

export function AuthProvider({ children }) {
  const [user, setUser]                     = useState(null)
  const [profile, setProfile]               = useState(null)
  const [loading, setLoading]               = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  // Tracks which user ID has already had its profile fetched.
  // Supabase SDK v2 fires SIGNED_IN on every tab focus, even with a valid session.
  // Without this guard, profileLoading=true on every focus unmounts the whole app.
  const profileFetchedForRef = useRef(null)

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
      // Invite: sign out any existing session so the invited user's token is
      // processed fresh, not on top of an existing (possibly different) session.
      if (HAS_INVITE_TOKEN) {
        await supabase.auth.signOut()
        if (!cancelled) setLoading(false)
        return  // onAuthStateChange handles the SIGNED_IN from the URL token
      }

      // Recovery: don't sign out — just yield to the SDK. The SDK exchanges the
      // ?code= for a session and fires PASSWORD_RECOVERY. Login.jsx listens for
      // that event to show the new-password form.
      if (HAS_RECOVERY_TOKEN) {
        if (!cancelled) setLoading(false)
        return
      }

      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return
        if (session?.user) {
          setUser(session.user)
          profileFetchedForRef.current = session.user.id
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
        profileFetchedForRef.current = null
        setUser(null)
        setProfile(null)
        setProfileLoading(false)
        return
      }

      if (!session?.user) return

      if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
        setUser(session.user)
        // SDK v2 fires SIGNED_IN on every tab focus — only re-fetch profile on a
        // genuinely new user (different ID or first login since page load).
        // PASSWORD_RECOVERY is included here because the SDK fires it instead of
        // SIGNED_IN for recovery flows, and we need the profile loaded so the
        // post-reset redirect lands on the correct role dashboard.
        if (profileFetchedForRef.current !== session.user.id) {
          profileFetchedForRef.current = session.user.id
          setProfileLoading(true)
          fetchProfile(session.user).catch(() => { if (!cancelled) setProfileLoading(false) })
        }
        return
      }

      // TOKEN_REFRESHED, USER_UPDATED, INITIAL_SESSION, etc.
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
