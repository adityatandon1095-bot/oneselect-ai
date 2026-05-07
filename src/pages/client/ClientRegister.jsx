import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function ClientRegister() {
  const navigate = useNavigate()
  const [companyName, setCompanyName] = useState('')
  const [fullName,    setFullName]    = useState('')
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [agreed,      setAgreed]      = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!agreed) { setError('Please agree to the Terms of Service to continue.'); return }
    setError('')
    setLoading(true)

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/self-signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, password, company_name: companyName, contact_name: fullName }),
    })

    const result = await res.json()
    if (!res.ok || result.error) {
      setError(result.error ?? 'Registration failed. Please try again.')
      setLoading(false)
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError('Account created. Please sign in to continue.')
      setLoading(false)
      navigate('/login')
      return
    }

    navigate('/client/dashboard?welcome=1')
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <img src="/oneselect-logo.png" alt="One Select" style={{ height: 38, marginBottom: 22 }} />
          <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 300, fontSize: 26, margin: 0, color: 'var(--text)' }}>
            Create Your Free Account
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6 }}>14-day free trial · No credit card required</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label>Company Name</label>
            <input type="text" required value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Ltd" autoFocus />
          </div>
          <div className="field">
            <label>Full Name</label>
            <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" />
          </div>
          <div className="field">
            <label>Work Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@acme.com" />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </div>

          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              style={{ marginTop: 3, flexShrink: 0, accentColor: 'var(--accent)', width: 14, height: 14 }}
            />
            <span>
              I agree to the{' '}
              <Link to="/terms" target="_blank" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Terms of Service</Link>
              {' '}and{' '}
              <Link to="/privacy" target="_blank" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Privacy Policy</Link>
            </span>
          </label>

          {error && (
            <div style={{ fontSize: 12, color: 'var(--red)', padding: '10px 12px', background: 'rgba(239,68,68,0.06)', border: '1px solid var(--red)', borderRadius: 'var(--r)' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', padding: '11px 0', fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 4 }}
          >
            {loading
              ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Creating account…</>
              : 'Create Free Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text-3)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Sign in →</Link>
        </p>
      </div>
    </div>
  )
}
