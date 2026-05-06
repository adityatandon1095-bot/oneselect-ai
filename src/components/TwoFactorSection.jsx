import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function TwoFactorSection() {
  const [factors,     setFactors]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [enrolling,   setEnrolling]   = useState(false)
  const [enrollData,  setEnrollData]  = useState(null) // { factorId, qrCode, secret }
  const [verifyCode,  setVerifyCode]  = useState('')
  const [verifying,   setVerifying]   = useState(false)
  const [unenrolling, setUnenrolling] = useState(false)
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState('')

  useEffect(() => { loadFactors() }, [])

  async function loadFactors() {
    setLoading(true)
    const { data } = await supabase.auth.mfa.listFactors()
    setFactors((data?.totp ?? []).filter(f => f.status === 'verified'))
    setLoading(false)
  }

  async function startEnroll() {
    setError(''); setSuccess('')
    setEnrolling(true)
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    setEnrolling(false)
    if (err) { setError(err.message); return }
    setEnrollData({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret })
    setVerifyCode('')
  }

  async function confirmEnroll() {
    if (!enrollData || verifyCode.length !== 6) return
    setVerifying(true); setError('')
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: enrollData.factorId })
    if (cErr) { setError(cErr.message); setVerifying(false); return }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId:    enrollData.factorId,
      challengeId: challenge.id,
      code:        verifyCode,
    })
    setVerifying(false)
    if (vErr) { setError('Invalid code — try again'); return }
    setEnrollData(null); setVerifyCode('')
    setSuccess('2FA enabled. Your account is now secured.')
    await loadFactors()
  }

  async function unenroll(factorId) {
    if (!confirm('Disable two-factor authentication? Your account will be less secure.')) return
    setUnenrolling(true)
    await supabase.auth.mfa.unenroll({ factorId })
    setUnenrolling(false)
    setSuccess('')
    await loadFactors()
  }

  const isEnabled = factors.length > 0

  return (
    <div className="section-card" style={{ marginBottom: 16 }}>
      <div className="section-card-head">
        <h3>Two-Factor Authentication</h3>
        {isEnabled && <span className="badge badge-green">Active</span>}
      </div>
      <div className="section-card-body">
        {loading ? (
          <span className="spinner" />
        ) : isEnabled ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>2FA is enabled</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
                Your account requires a 6-digit code from your authenticator app each time you sign in.
              </div>
            </div>
            <button
              className="btn btn-secondary"
              style={{ fontSize: 11, color: 'var(--red)', flexShrink: 0 }}
              disabled={unenrolling}
              onClick={() => unenroll(factors[0].id)}
            >
              {unenrolling ? 'Removing…' : 'Disable 2FA'}
            </button>
          </div>
        ) : enrollData ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7, margin: 0 }}>
              Scan this QR code with <strong>Google Authenticator</strong>, <strong>Authy</strong>, or any TOTP app, then enter the 6-digit code to confirm.
            </p>
            <div
              dangerouslySetInnerHTML={{ __html: enrollData.qrCode }}
              style={{ width: 180, height: 180, background: 'white', padding: 8, borderRadius: 'var(--r)', border: '1px solid var(--border)' }}
            />
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', background: 'var(--surface2)', padding: '8px 12px', borderRadius: 'var(--r)', letterSpacing: '0.06em' }}>
              Manual entry: {enrollData.secret}
            </div>
            {error && <div className="error-banner">{error}</div>}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={verifyCode}
                onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                style={{ width: 120, fontFamily: 'var(--font-mono)', letterSpacing: '0.3em', fontSize: 18, textAlign: 'center' }}
                autoFocus
              />
              <button className="btn btn-primary" onClick={confirmEnroll} disabled={verifying || verifyCode.length !== 6}>
                {verifying ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Verifying…</> : 'Confirm'}
              </button>
              <button className="btn btn-secondary" onClick={() => { setEnrollData(null); setError('') }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7 }}>
                Add an extra layer of security. You'll need a verification code from your phone each time you sign in.
              </div>
              {success && <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 8, fontFamily: 'var(--font-mono)' }}>✓ {success}</div>}
              {error   && <div className="error-banner" style={{ marginTop: 8 }}>{error}</div>}
            </div>
            <button className="btn btn-primary" style={{ fontSize: 11, flexShrink: 0 }} disabled={enrolling} onClick={startEnroll}>
              {enrolling ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Setting up…</> : 'Enable 2FA'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
