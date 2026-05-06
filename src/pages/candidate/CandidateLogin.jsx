import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function CandidateLogin() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.signOut({ scope: 'local' }).catch(() => {})
  }, [])

  async function handleSignIn(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
    if (authErr) {
      setError('Invalid email or password.')
      setLoading(false)
      return
    }

    const { data: profile } = await supabase.from('profiles').select('user_role').eq('id', data.user.id).single()
    if (!profile || profile.user_role !== 'candidate') {
      await supabase.auth.signOut()
      setError('This account is not a candidate account. Use the main login page instead.')
      setLoading(false)
      return
    }

    navigate('/candidate/dashboard', { replace: true })
    setLoading(false)
  }

  return (
    <div className="login-screen">
      <div className="login-panel-left">
        <p className="login-tagline-label">Talent Network</p>
        <div className="login-divider" />
        <p className="login-quote">Find your next role. We match you to the right opportunities.</p>
      </div>

      <div className="login-panel-right">
        <div className="login-form-wrap">
          <img src="/oneselect-logo.png" alt="One Select" style={{ width: 200, height: 'auto', objectFit: 'contain', marginBottom: 36, display: 'block' }} />

          <h2 className="login-welcome">Welcome back</h2>
          <p className="login-sub">Sign in to see your matches and interview status</p>

          {error && <div className="error-banner">{error}</div>}

          <form className="login-form" onSubmit={handleSignIn}>
            <div className="field">
              <label>Email</label>
              <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Signing in…</> : 'Sign in'}
            </button>
          </form>

          <p style={{ marginTop: 20, fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>
            New here?{' '}
            <Link to="/candidate/register" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Create your profile →</Link>
          </p>
          <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
            Recruiter or admin?{' '}
            <Link to="/login" style={{ color: 'var(--text-3)' }}>Sign in here</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
