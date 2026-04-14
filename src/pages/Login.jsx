import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) { setError(authError.message); setLoading(false); return }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_role')
      .eq('id', data.user.id)
      .single()

    console.log('[Login] profile →', { profile, profileError })

    if (profileError || !profile) {
      setError('Could not load your profile. Please try again or contact support.')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    navigate(profile.user_role === 'admin' ? '/admin' : '/recruiter', { replace: true })
    setLoading(false)
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
          <h2 className="login-welcome">Welcome back</h2>
          <p className="login-sub">Sign in to your account</p>

          {error && <div className="error-banner">{error}</div>}

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="field">
              <label>Email</label>
              <input
                type="email" required autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                type="password" required autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Signing in…</> : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
