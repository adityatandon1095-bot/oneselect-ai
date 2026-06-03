import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function sanitizeAuthError(msg) {
  if (!msg) return 'An error occurred. Please try again.'
  const m = String(msg).toLowerCase()
  if (m.includes('invalid login') || m.includes('invalid credentials') || m.includes('user not found'))
    return 'Invalid email or password.'
  if (m.includes('email not confirmed'))
    return 'Please verify your email address before signing in.'
  if (m.includes('too many requests') || m.includes('rate limit'))
    return 'Too many login attempts. Please wait a few minutes and try again.'
  if (m.includes('jwt') || m.includes('token') || m.includes('expired'))
    return 'This link has expired or already been used. Please request a new one.'
  if (m.includes('password') && m.includes('weak'))
    return 'Password is too weak. Use at least 8 characters with mixed case and numbers.'
  if (m.includes('network') || m.includes('fetch'))
    return 'Connection error. Please check your internet and try again.'
  // Generic fallback — don't expose internal DB/stack details
  return 'An error occurred. Please try again or contact support.'
}

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
  const [loading, setLoading]         = useState(false)
  const [signingOut, setSigningOut]   = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const hashParams   = new URLSearchParams(window.location.hash.slice(1))
    const searchParams = new URLSearchParams(window.location.search)
    const urlType = hashParams.get('type') || searchParams.get('type')
    // PKCE recovery/invite links carry ?code= instead of a hash type param
    const hasCode = !!searchParams.get('code')

    // Pre-fill email from invite link ?email= param
    const prefilledEmail = searchParams.get('email') ?? ''
    if (prefilledEmail) setEmail(prefilledEmail)

    // Show error if redirected here because profile row was missing
    if (searchParams.get('error') === 'profile_missing') {
      setError('Your account profile could not be loaded. Please sign in again or contact support.')
    }

    if (urlType === 'recovery' || urlType === 'invite') {
      // Legacy implicit-flow link — type is explicit in the hash
      setMode('reset')
    } else if (!hasCode) {
      // Normal login page — clear any stale session so autofill can't fire early
      setSigningOut(true)
      supabase.auth.signOut({ scope: 'local' }).finally(() => setSigningOut(false))
    }
    // hasCode = PKCE recovery/invite link — don't sign out; the SDK will exchange
    // the code and fire PASSWORD_RECOVERY. Signing out here wipes the session
    // before updateUser() can use it, which is the cause of the "error" on submit.

    // Tracks whether the ?code= exchange fired a successful auth event.
    // Used by the expired-link timeout below.
    let codeResolved = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        codeResolved = true
        setMode('reset')
        setError('')
        setInfo('')
      } else if (event === 'SIGNED_IN' && hasCode) {
        codeResolved = true
        if (urlType !== 'recovery' && urlType !== 'invite') {
          // Magic link login completed — redirect to role dashboard
          navigate('/', { replace: true })
        }
        // For invite: mode is already 'reset' (set at line 54), nothing else needed
      }
    })

    // Race-condition fallback: the SDK may exchange the PKCE code and fire
    // PASSWORD_RECOVERY before the listener above is registered. Only applicable
    // for recovery flows — magic link ?code= must NOT set mode='reset'.
    if (hasCode && urlType === 'recovery') {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) { codeResolved = true; setMode('reset'); setError(''); setInfo('') }
      })
    }

    // Expired-link detection: if the page loaded with a ?code= but no auth event
    // fires within 5 seconds, the link has expired or was already used.
    let expiredTimer = null
    if (hasCode) {
      expiredTimer = setTimeout(() => {
        if (!codeResolved) {
          setError('This link has expired or has already been used. Please request a new one.')
          setMode('login')
        }
      }, 5000)
    }

    return () => {
      subscription.unsubscribe()
      if (expiredTimer) clearTimeout(expiredTimer)
    }
  }, [])

  // ── Sign in ────────────────────────────────────────────────────────────────
  const handleSignIn = async (e) => {
    e.preventDefault()
    setError(''); setInfo('')
    setLoading(true)

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) { setError(sanitizeAuthError(authError.message)); setLoading(false); return }

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

    // Trust the DB role for existing profiles. user_metadata.role was set at invite
    // time and is never updated — overwriting the DB role on every sign-in would
    // silently revert intentional admin role changes.
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
    if (resetError) { setError(sanitizeAuthError(resetError.message)); return }
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

    if (updateError) { setError(sanitizeAuthError(updateError.message)); return }

    setInfo('Password updated successfully')
    setTimeout(() => navigate('/', { replace: true }), 1500)
  }

  if (signingOut) return <div className="page"><span className="spinner" /></div>

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

              {/* Role selection hint */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--accent)', background: 'var(--accent-d)', borderRadius: 'var(--r)', fontSize: 10, color: 'var(--accent)', textAlign: 'center', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  ◎ Recruiter / Client
                </div>
                <button
                  type="button"
                  onClick={() => window.location.href = '/candidate/login'}
                  style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--border2)', background: 'transparent', borderRadius: 'var(--r)', fontSize: 10, color: 'var(--text-3)', textAlign: 'center', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', transition: 'border-color 0.12s, color 0.12s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text-3)' }}
                >
                  ◌ Candidate →
                </button>
              </div>

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
              <p style={{ marginTop: 20, fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>
                New client?{' '}
                <Link to="/signup" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Get started →</Link>
              </p>
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
              {info  && <div className="error-banner" style={{ background: 'var(--green-d)', borderColor: 'var(--green)', color: 'var(--green)' }}>{info}</div>}

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
