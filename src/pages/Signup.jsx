import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Signup() {
  const navigate = useNavigate()
  const [company,   setCompany]   = useState('')
  const [contact,   setContact]   = useState('')
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [success,   setSuccess]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!company.trim())          { setError('Company name is required'); return }
    if (!email.trim())            { setError('Email is required'); return }
    if (password.length < 8)      { setError('Password must be at least 8 characters'); return }
    if (password !== confirm)     { setError('Passwords do not match'); return }

    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/self-signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          email:        email.trim().toLowerCase(),
          password,
          company_name: company.trim(),
          contact_name: contact.trim(),
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Signup failed')
      setSuccess(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
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
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.2 }}>◈</div>
              <h2 className="login-welcome">You're in.</h2>
              <p className="login-sub" style={{ marginBottom: 28 }}>
                Your account has been created. You're on a free trial — sign in to get started.
              </p>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate('/login')}>
                Sign in to your account →
              </button>
            </div>
          </div>
        </div>
      </div>
    )
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

          <h2 className="login-welcome">Get started</h2>
          <p className="login-sub">Create your client account — free trial, no card required</p>

          {error && <div className="error-banner">{error}</div>}

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="field">
              <label>Company Name *</label>
              <input type="text" required autoFocus placeholder="Acme Corp" value={company} onChange={e => setCompany(e.target.value)} />
            </div>
            <div className="field">
              <label>Your Name</label>
              <input type="text" placeholder="Jane Smith" value={contact} onChange={e => setContact(e.target.value)} />
            </div>
            <div className="field">
              <label>Work Email *</label>
              <input type="email" required autoComplete="email" placeholder="jane@acmecorp.com" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label>Password *</label>
              <input type="password" required autoComplete="new-password" placeholder="At least 8 characters" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <div className="field">
              <label>Confirm Password *</label>
              <input type="password" required autoComplete="new-password" placeholder="Repeat your password" value={confirm} onChange={e => setConfirm(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Creating account…</> : 'Create Account'}
            </button>
          </form>

          <p style={{ marginTop: 20, fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
