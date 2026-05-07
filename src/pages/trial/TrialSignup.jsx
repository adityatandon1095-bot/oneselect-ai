import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function TrialSignup() {
  const navigate = useNavigate()
  const [companyName, setCompanyName] = useState('')
  const [fullName,    setFullName]    = useState('')
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [phone,       setPhone]       = useState('')
  const [agreed,      setAgreed]      = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!agreed) { setError('Please agree to the Terms of Service to continue.'); return }
    setError('')
    setLoading(true)

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/self-signup`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        email,
        password,
        company_name: companyName,
        contact_name: fullName,
        full_name:    fullName,
        phone:        phone || null,
        user_role:    'client',
        is_trial:     true,
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    })

    const result = await res.json()
    if (!res.ok || result.error) {
      setError(result.error ?? 'Registration failed. Please try again.')
      setLoading(false)
      return
    }

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError('Account created. Please sign in to continue.')
      setLoading(false)
      navigate('/login')
      return
    }

    if (phone && signInData?.user) {
      await supabase.from('profiles').update({ phone: phone.trim() }).eq('id', signInData.user.id)
    }

    navigate('/client/dashboard')
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 24px',
      fontFamily: 'var(--font-body)',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/oneselect-logo.png" alt="One Select" style={{ height: 38, marginBottom: 24 }} />
          <h1 style={{
            fontFamily: 'var(--font-head)',
            fontWeight: 300,
            fontSize: 28,
            margin: '0 0 8px',
            color: 'var(--text)',
            letterSpacing: '-0.01em',
            lineHeight: 1.2,
          }}>
            Start Your Free 14-Day Trial
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0, lineHeight: 1.6 }}>
            See the full AI hiring pipeline. No credit card required.
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r)',
          padding: '28px 28px 24px',
        }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <div className="field">
              <label>Company Name</label>
              <input
                type="text"
                required
                autoFocus
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="Acme Technologies"
              />
            </div>

            <div className="field">
              <label>Your Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Jane Smith"
              />
            </div>

            <div className="field">
              <label>Work Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="jane@acme.com"
              />
            </div>

            <div className="field">
              <label>Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>

            <div className="field">
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                Phone Number
                <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>Optional</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>

            <label style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              cursor: 'pointer',
              fontSize: 12,
              color: 'var(--text-2)',
              lineHeight: 1.6,
              marginTop: 2,
            }}>
              <input
                type="checkbox"
                required
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
              <div style={{
                fontSize: 12,
                color: 'var(--red)',
                padding: '10px 12px',
                background: 'rgba(239,68,68,0.06)',
                border: '1px solid var(--red)',
                borderRadius: 'var(--r)',
                lineHeight: 1.5,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '12px 0',
                fontSize: 12,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginTop: 4,
              }}
            >
              {loading
                ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Creating account…</>
                : 'Create Free Account'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 18, marginBottom: 0, fontSize: 12, color: 'var(--text-3)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Sign in →</Link>
          </p>
        </div>

        {/* Trust signals */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 24,
          marginTop: 20,
          flexWrap: 'wrap',
        }}>
          {[
            'No credit card required',
            'Full platform access for 14 days',
            'Setup in under 2 minutes',
          ].map(text => (
            <span key={text} style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>✓</span>
              {text}
            </span>
          ))}
        </div>

      </div>
    </div>
  )
}
