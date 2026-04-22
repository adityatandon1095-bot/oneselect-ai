import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function roleHome(role) {
  if (role === 'admin')     return '/admin/dashboard'
  if (role === 'candidate') return '/candidate/dashboard'
  if (role === 'client')    return '/client/dashboard'
  return '/recruiter/dashboard'
}

export default function Login() {
  const [mode, setMode]           = useState('login') // 'login' | 'forgot' | 'reset'
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [newPassword, setNewPw]   = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [error, setError]         = useState('')
  const [info, setInfo]           = useState('')
  const [loading, setLoading]     = useState(false)
  const navigate = useNavigate()

  // Detect when Supabase redirects back with a PASSWORD_RECOVERY token.
  // The Supabase client processes the URL hash immediately on load — before useEffect
  // runs — so the PASSWORD_RECOVERY event can fire before the listener is attached.
  // We guard against that by also checking the URL hash/params directly on mount.
  useEffect(() => {
    const hashParams   = new URLSearchParams(window.location.hash.slice(1))
    const searchParams = new URLSearchParams(window.location.search)
    const urlType = hashParams.get('type') || searchParams.get('type')

    if (urlType === 'recovery' || urlType === 'invite') {
      // Keep the recovery/invite session so the user can set their password
      setMode('reset')
    } else {
      // No auth token in the URL — clear any existing session immediately.
      // This ensures invite email links always land on a fresh login form
      // even if a different user's session is active in the same browser.
      supabase.auth.signOut()
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('reset')
        setError('')
        setInfo('')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Sign in ────────────────────────────────────────────────────────────────
  const handleSignIn = async (e) => {
    e.preventDefault()
    setError(''); setInfo('')
    setLoading(true)

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) { setError(authError.message); setLoading(false); return }

    const userId   = data.user.id
    const metaRole = data.user.user_metadata?.role  // set by invite-user edge function

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_role')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      // Profile row missing — create it from user_metadata so the user isn't locked out.
      // This covers the edge case where the edge function created the auth user but the
      // profile insert failed, or where the profile was deleted and the user re-invited.
      const role = metaRole || 'client'
      const { error: insertError } = await supabase.from('profiles').insert({
        id:           userId,
        user_role:    role,
        email:        data.user.email,
        company_name: data.user.user_metadata?.company_name ?? null,
        full_name:    data.user.user_metadata?.contact_name ?? data.user.user_metadata?.full_name ?? null,
        first_login:  true,
      })
      if (insertError) {
        setError('Could not load your profile. Please try again or contact support.')
        await supabase.auth.signOut()
        setLoading(false)
        return
      }
      navigate(roleHome(role), { replace: true })
      setLoading(false)
      return
    }

    // Self-heal: if user_metadata has a role and it disagrees with the profile,
    // the profile was probably written by a stale edge function. Correct it now —
    // users are allowed to update their own profile row (profiles_update_own policy).
    const validRoles = ['admin', 'recruiter', 'client', 'candidate']
    if (metaRole && validRoles.includes(metaRole) && profile.user_role !== metaRole) {
      await supabase.from('profiles').update({ user_role: metaRole }).eq('id', userId)
      navigate(roleHome(metaRole), { replace: true })
      setLoading(false)
      return
    }

    navigate(roleHome(profile.user_role), { replace: true })
    setLoading(false)
  }

  // ── Forgot password — send reset email ────────────────────────────────────
  const handleForgot = async (e) => {
    e.preventDefault()
    if (!email.trim()) { setError('Please enter your email address'); return }
    setError(''); setLoading(true)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + '/login',
    })

    setLoading(false)
    if (resetError) { setError(resetError.message); return }
    setInfo(`Password reset link sent to ${email.trim()}. Check your inbox.`)
  }

  // ── Reset password — set new password after clicking email link ───────────
  const handleReset = async (e) => {
    e.preventDefault()
    setError('')
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return }
    if (newPassword !== confirmPw) { setError('Passwords do not match'); return }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    setLoading(false)

    if (updateError) { setError(updateError.message); return }

    // Navigate to dashboard — auth state will route correctly
    navigate('/', { replace: true })
  }

  return (
    <div className="login-screen">
      <div className="login-panel-left">
        <p className="login-tagline-label">Strategic Talent Solutions</p>
        <div className="login-divider" />
        <p className="login-quote">The right person in the right role changes everything.</p>
      </div>

      <div className="login-panel-right">
        <div className="login-form-wrap">
          <img src="/oneselect-logo.png" alt="One Select" style={{ width: 200, height: 'auto', objectFit: 'contain', marginBottom: 36, display: 'block' }} />

          {/* ── Sign in ── */}
          {mode === 'login' && (
            <>
              <h2 className="login-welcome">Welcome back</h2>
              <p className="login-sub">Sign in to your account</p>

              {error && <div className="error-banner">{error}</div>}
              {info  && <div className="error-banner" style={{ background: 'var(--green-d)', borderColor: 'var(--green)', color: 'var(--green)' }}>{info}</div>}

              <form className="login-form" onSubmit={handleSignIn}>
                <div className="field">
                  <label>Email</label>
                  <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
                </div>
                <div className="field">
                  <label>Password</label>
                  <input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
                </div>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Signing in…</> : 'Sign in'}
                </button>
              </form>

              <button
                onClick={() => { setMode('forgot'); setError(''); setInfo('') }}
                style={{ marginTop: 16, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-3)', textDecoration: 'underline', padding: 0 }}
              >
                Forgot password?
              </button>
            </>
          )}

          {/* ── Forgot password ── */}
          {mode === 'forgot' && (
            <>
              <h2 className="login-welcome">Reset Password</h2>
              <p className="login-sub">Enter your email and we'll send you a reset link</p>

              {error && <div className="error-banner">{error}</div>}
              {info  && <div className="error-banner" style={{ background: 'var(--green-d)', borderColor: 'var(--green)', color: 'var(--green)' }}>{info}</div>}

              {!info && (
                <form className="login-form" onSubmit={handleForgot}>
                  <div className="field">
                    <label>Email</label>
                    <input type="email" required autoFocus autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Sending…</> : 'Send Reset Link'}
                  </button>
                </form>
              )}

              <button
                onClick={() => { setMode('login'); setError(''); setInfo('') }}
                style={{ marginTop: 16, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-3)', textDecoration: 'underline', padding: 0 }}
              >
                ← Back to sign in
              </button>
            </>
          )}

          {/* ── Set new password (after clicking reset/invite link in email) ── */}
          {mode === 'reset' && (
            <>
              <h2 className="login-welcome">Set Your Password</h2>
              <p className="login-sub">Choose a secure password for your account</p>

              {error && <div className="error-banner">{error}</div>}

              <form className="login-form" onSubmit={handleReset}>
                <div className="field">
                  <label>New Password</label>
                  <input type="password" required autoFocus autoComplete="new-password" value={newPassword} onChange={e => setNewPw(e.target.value)} placeholder="At least 8 characters" />
                </div>
                <div className="field">
                  <label>Confirm Password</label>
                  <input type="password" required autoComplete="new-password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat your new password" />
                </div>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Updating…</> : 'Set Password & Continue'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
