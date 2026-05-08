import { useState, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import mammoth from 'mammoth'
import { supabase } from '../../lib/supabase'
import { callClaude } from '../../utils/api'
import { extractContent, isSupported, fileExt, ACCEPT_ATTR } from '../../utils/fileExtract'
import TagInput from '../../components/TagInput'

const CV_PARSE_SYSTEM = `You are a CV parser. Return ONLY valid JSON — no markdown:
{"name":"string","email":"string","currentRole":"string","totalYears":number,"skills":["..."],"education":"string","summary":"string","highlights":["..."],"linkedinUrl":"string or null"}`

// ── Styles injected once into <head> via React 19 hoisting ─────────────────
const REG_STYLES = `
  .cr-field { display: flex; flex-direction: column; gap: 6px; }
  .cr-label {
    font-family: var(--font-mono);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #999;
  }
  .cr-input {
    width: 100%;
    border: none;
    border-bottom: 1px solid var(--border);
    background: transparent;
    padding: 10px 0;
    font-family: 'DM Sans', sans-serif;
    font-size: 14px;
    color: var(--text);
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;
    border-radius: 0;
  }
  .cr-input:focus { border-bottom-color: var(--accent); }
  .cr-input::placeholder { color: #bbb; }
  .cr-tag-wrap .tag-input-container {
    border: none !important;
    border-bottom: 1px solid var(--border) !important;
    border-radius: 0 !important;
    background: transparent !important;
    padding: 8px 0 !important;
    box-shadow: none !important;
  }
  .cr-tag-wrap .tag-input-container:focus-within {
    border-bottom-color: var(--accent) !important;
  }
  .cr-tag-wrap input {
    font-family: 'DM Sans', sans-serif !important;
    font-size: 14px !important;
    background: transparent !important;
  }
`

// ── Shared left panel ──────────────────────────────────────────────────────
function LeftPanel() {
  const TRUST = [
    'AI-matched to relevant roles',
    'Screened by expert recruiters',
    'DPDPA compliant — your data is safe',
  ]
  return (
    <div style={{
      width: '40%',
      minHeight: '100vh',
      background: '#1A1814',
      display: 'flex',
      flexDirection: 'column',
      padding: '48px 44px',
      position: 'sticky',
      top: 0,
      alignSelf: 'flex-start',
      boxSizing: 'border-box',
      flexShrink: 0,
    }}>
      <img
        src="/oneselect-logo.png"
        alt="One Select"
        style={{ height: 30, objectFit: 'contain', objectPosition: 'left', marginBottom: 0, filter: 'brightness(0) invert(1)', opacity: 0.9 }}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 48, paddingBottom: 48 }}>
        <h1 style={{
          fontFamily: 'var(--font-head)',
          fontWeight: 300,
          fontSize: 44,
          color: '#F8F4EE',
          lineHeight: 1.1,
          margin: '0 0 16px',
          letterSpacing: '-0.01em',
        }}>
          Find Your<br />Next Role
        </h1>
        <p style={{
          fontStyle: 'italic',
          fontSize: 14,
          color: 'rgba(248,244,238,0.45)',
          margin: '0 0 48px',
          lineHeight: 1.6,
          fontFamily: 'var(--font-body)',
        }}>
          We match you to the right opportunities.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {TRUST.map((text, i) => (
            <div key={text}>
              {i > 0 && (
                <div style={{ height: 1, background: 'rgba(184,146,74,0.25)', margin: '18px 0' }} />
              )}
              <p style={{
                fontSize: 13,
                color: 'rgba(248,244,238,0.65)',
                margin: 0,
                fontFamily: 'var(--font-body)',
                lineHeight: 1.5,
                paddingLeft: 14,
                borderLeft: '2px solid rgba(184,146,74,0.5)',
              }}>
                {text}
              </p>
            </div>
          ))}
        </div>
      </div>

      <p style={{
        fontSize: 11,
        color: 'rgba(248,244,238,0.25)',
        fontFamily: 'var(--font-mono)',
        margin: 0,
        letterSpacing: '0.04em',
      }}>
        © One Select 2026
      </p>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function CandidateRegister() {
  const navigate = useNavigate()
  const fileInputRef = useRef()

  // ── All state — unchanged ────────────────────────────────────────────────
  const [fullName,    setFullName]    = useState('')
  const [email,       setEmail]       = useState('')
  const [phone,       setPhone]       = useState('')
  const [currentRole, setCurrentRole] = useState('')
  const [totalYears,  setTotalYears]  = useState('')
  const [skills,      setSkills]      = useState([])
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [password,    setPassword]    = useState('')
  const [confirmPw,   setConfirmPw]   = useState('')
  const [cvFile,      setCvFile]      = useState(null)
  const [consent,     setConsent]     = useState(false)
  const [step,        setStep]        = useState('form') // 'form' | 'processing' | 'done' | 'confirm_email'
  const [statusMsg,   setStatusMsg]   = useState('')
  const [error,       setError]       = useState('')

  // ── All handlers — unchanged ─────────────────────────────────────────────
  const handleFileChange = useCallback((e) => {
    const f = e.target.files[0]
    if (f && isSupported(f)) setCvFile(f)
    e.target.value = ''
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!fullName.trim()) { setError('Full name is required'); return }
    if (!email.trim())    { setError('Email is required'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirmPw) { setError('Passwords do not match'); return }
    if (!consent) { setError('Please accept the privacy policy to continue'); return }

    setStep('processing')
    setStatusMsg('Creating your account…')

    try {
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { role: 'candidate', full_name: fullName.trim() } },
      })
      if (authErr) throw new Error(authErr.message)

      const userId = authData.user?.id
      if (!userId) throw new Error('Account creation failed — please try again.')

      setStatusMsg('Setting up your profile…')
      const { error: profileErr } = await supabase.from('profiles').insert({
        id:        userId,
        user_role: 'candidate',
        email:     email.trim().toLowerCase(),
        full_name: fullName.trim(),
      })
      if (profileErr && !profileErr.message.includes('duplicate')) {
        console.warn('Profile insert warning:', profileErr.message)
      }

      let parsed = null
      let rawText = ''
      if (cvFile) {
        setStatusMsg('Parsing your CV with AI…')
        try {
          let content
          if (fileExt(cvFile) === 'docx') {
            const ab = await cvFile.arrayBuffer()
            const res = await mammoth.extractRawText({ arrayBuffer: ab })
            content = { kind: 'text', text: res.value }
          } else {
            content = await extractContent(cvFile)
          }
          rawText = content.kind === 'text' ? content.text : ''
          const { data: sess } = await supabase.auth.getSession()
          if (sess?.session?.access_token) {
            const msgs = content.kind === 'image'
              ? [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: content.mediaType, data: content.base64 } }, { type: 'text', text: 'Parse this CV image.' }] }]
              : [{ role: 'user', content: `Parse this CV:\n\n${content.text}` }]
            const reply = await callClaude(msgs, CV_PARSE_SYSTEM, 1024)
            parsed = JSON.parse(reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
          }
        } catch (cvErr) {
          // Non-fatal
        }
      }

      setStatusMsg('Adding you to the talent network…')
      const { error: poolErr } = await supabase.from('talent_pool').insert({
        full_name:          fullName.trim() || parsed?.name || '',
        email:              email.trim().toLowerCase(),
        candidate_role:     currentRole.trim() || parsed?.currentRole || '',
        total_years:        parseInt(totalYears) || parsed?.totalYears || 0,
        skills:             skills.length ? skills : (parsed?.skills ?? []),
        education:          parsed?.education ?? '',
        summary:            parsed?.summary ?? '',
        highlights:         parsed?.highlights ?? [],
        raw_text:           rawText,
        availability:       'available',
        source:             'candidate_registered',
        linkedin_url:       linkedinUrl.trim() || parsed?.linkedinUrl || null,
        candidate_user_id:  userId,
        visibility:         'all',
      })
      if (poolErr) console.warn('Pool insert warning:', poolErr.message)

      await supabase.from('candidates')
        .update({ candidate_user_id: userId })
        .ilike('email', email.trim().toLowerCase())
        .is('candidate_user_id', null)

      const { data: sessionData } = await supabase.auth.getSession()
      if (sessionData?.session) {
        setStep('done')
      } else {
        setStep('confirm_email')
      }
    } catch (err) {
      setError(err.message)
      setStep('form')
    }
  }

  // ── Processing state ─────────────────────────────────────────────────────
  if (step === 'processing') {
    return (
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <style>{REG_STYLES}</style>
        <LeftPanel />
        <div style={{ flex: 1, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <div style={{ textAlign: 'center', maxWidth: 360 }}>
            <span className="spinner" style={{ width: 36, height: 36, margin: '0 auto 28px', display: 'block' }} />
            <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 300, fontSize: 28, margin: '0 0 10px', color: 'var(--text)' }}>
              Setting up your profile
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-3)', fontFamily: 'var(--font-body)', margin: 0 }}>{statusMsg}</p>
          </div>
        </div>
      </div>
    )
  }

  // ── Done state ───────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <style>{REG_STYLES}</style>
        <LeftPanel />
        <div style={{ flex: 1, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ fontSize: 36, marginBottom: 20, fontFamily: 'var(--font-head)', color: 'var(--accent)', opacity: 0.7 }}>◈</div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 300, fontSize: 32, margin: '0 0 14px', color: 'var(--text)' }}>
              You're in the network.
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.8, marginBottom: 32, fontFamily: 'var(--font-body)' }}>
              Your profile has been created. You'll be matched to relevant roles automatically.
              We'll be in touch when you match a role.
            </p>
            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '13px 0', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}
              onClick={() => navigate('/candidate/dashboard')}
            >
              Go to your dashboard →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Confirm email state ──────────────────────────────────────────────────
  if (step === 'confirm_email') {
    return (
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <style>{REG_STYLES}</style>
        <LeftPanel />
        <div style={{ flex: 1, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ fontSize: 36, marginBottom: 20, color: 'var(--accent)' }}>✉</div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 300, fontSize: 32, margin: '0 0 14px', color: 'var(--text)' }}>
              Check your email
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.8, marginBottom: 32, fontFamily: 'var(--font-body)' }}>
              We've sent a confirmation link to <strong style={{ color: 'var(--text)' }}>{email}</strong>.
              Click the link to activate your account, then sign in to see your matches.
            </p>
            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '13px 0', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}
              onClick={() => navigate('/candidate/login')}
            >
              Sign in →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Main form ────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'flex-start' }}>
      <style>{REG_STYLES}</style>
      <LeftPanel />

      {/* Right panel */}
      <div style={{
        flex: 1,
        background: 'var(--bg)',
        overflowY: 'auto',
        maxHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}>
        <div style={{ width: '100%', maxWidth: 480, padding: '48px 32px 48px', boxSizing: 'border-box' }}>

          {/* Logo — visible only on mobile */}
          <img
            src="/oneselect-logo.png"
            alt="One Select"
            style={{ height: 28, objectFit: 'contain', objectPosition: 'left', marginBottom: 32, display: 'block' }}
            className="cr-mobile-logo"
          />

          {/* Heading */}
          <h1 style={{
            fontFamily: 'var(--font-head)',
            fontWeight: 300,
            fontSize: 32,
            color: 'var(--text)',
            margin: '0 0 8px',
            letterSpacing: '-0.01em',
            lineHeight: 1.15,
          }}>
            Join Our Talent Network
          </h1>
          <p style={{
            fontSize: 14,
            color: 'var(--text-3)',
            fontFamily: 'var(--font-body)',
            margin: '0 0 18px',
            lineHeight: 1.6,
          }}>
            Create your profile to get matched to relevant roles
          </p>
          <div style={{ height: 2, width: 40, background: 'var(--accent)', marginBottom: 32, opacity: 0.8 }} />

          {error && (
            <div style={{
              fontSize: 13,
              color: 'var(--red)',
              padding: '11px 14px',
              background: 'rgba(239,68,68,0.06)',
              border: '1px solid var(--red)',
              borderRadius: 'var(--r)',
              marginBottom: 24,
              fontFamily: 'var(--font-body)',
              lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Full Name */}
            <div className="cr-field">
              <label className="cr-label">Full Name *</label>
              <input className="cr-input" type="text" required autoFocus value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" />
            </div>

            {/* Email */}
            <div className="cr-field">
              <label className="cr-label">Email *</label>
              <input className="cr-input" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" />
            </div>

            {/* Phone */}
            <div className="cr-field">
              <label className="cr-label">Phone</label>
              <input className="cr-input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" />
            </div>

            {/* Current Role + Years Experience */}
            <div style={{ display: 'grid', gridTemplateColumns: '7fr 3fr', gap: 20 }}>
              <div className="cr-field">
                <label className="cr-label">Current Role / Title</label>
                <input className="cr-input" type="text" value={currentRole} onChange={e => setCurrentRole(e.target.value)} placeholder="Senior Software Engineer" />
              </div>
              <div className="cr-field">
                <label className="cr-label">Years Exp.</label>
                <input className="cr-input" type="number" min={0} max={40} value={totalYears} onChange={e => setTotalYears(e.target.value)} placeholder="5" />
              </div>
            </div>

            {/* Skills */}
            <div className="cr-field">
              <label className="cr-label">Skills</label>
              <div className="cr-tag-wrap">
                <TagInput value={skills} onChange={setSkills} placeholder="Type a skill and press Enter…" />
              </div>
            </div>

            {/* LinkedIn */}
            <div className="cr-field">
              <label className="cr-label">LinkedIn URL <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: 10, color: '#bbb' }}>(optional)</span></label>
              <input className="cr-input" type="url" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/yourname" />
            </div>

            {/* CV Upload */}
            <div className="cr-field">
              <label className="cr-label">Upload CV <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: 10, color: '#bbb' }}>(optional)</span></label>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '1px dashed var(--border)',
                  borderRadius: 'var(--r)',
                  padding: '22px 16px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'border-color 0.15s',
                  marginTop: 4,
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                {cvFile ? (
                  <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-body)' }}>
                    <span style={{ marginRight: 8 }}>📄</span>
                    {cvFile.name}
                    <span style={{ color: 'var(--green)', marginLeft: 8, fontWeight: 600 }}>✓</span>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 20, marginBottom: 8, opacity: 0.3 }}>↑</div>
                    <div style={{ fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
                      Drop CV here or{' '}
                      <span style={{ color: 'var(--accent)' }}>browse</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#bbb', fontFamily: 'var(--font-mono)', marginTop: 6, letterSpacing: '0.04em' }}>
                      PDF · DOCX · TXT
                    </div>
                  </>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept={ACCEPT_ATTR} style={{ display: 'none' }} onChange={handleFileChange} />
              <p style={{ fontSize: 11, color: '#bbb', marginTop: 6, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                We'll use your CV to auto-fill your profile and improve job matching
              </p>
            </div>

            {/* Password */}
            <div className="cr-field">
              <label className="cr-label">Password *</label>
              <input className="cr-input" type="password" required autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </div>

            {/* Confirm Password */}
            <div className="cr-field">
              <label className="cr-label">Confirm Password *</label>
              <input className="cr-input" type="password" required autoComplete="new-password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat your password" />
            </div>

            {/* Privacy consent */}
            <label style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={consent}
                onChange={e => setConsent(e.target.checked)}
                style={{ flexShrink: 0, accentColor: 'var(--accent)', width: 15, height: 15 }}
              />
              <span style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>
                I agree to the{' '}
                <Link to="/privacy" target="_blank" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Privacy Policy</Link>
                {' '}and consent to my personal data and CV being processed for job matching purposes under the Digital Personal Data Protection Act 2023.
              </span>
            </label>

            {/* Submit */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 }}>
              <button
                type="submit"
                disabled={!consent}
                style={{
                  width: '100%',
                  background: consent ? 'var(--accent)' : 'var(--border)',
                  color: consent ? 'white' : '#999',
                  border: 'none',
                  padding: '13px 0',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  cursor: consent ? 'pointer' : 'not-allowed',
                  borderRadius: 'var(--r)',
                  transition: 'background 0.15s, opacity 0.15s',
                }}
              >
                Join Talent Network
              </button>

              <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-3)', margin: 0, fontFamily: 'var(--font-body)' }}>
                Already registered?{' '}
                <Link to="/candidate/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Sign in →</Link>
              </p>
            </div>

          </form>
        </div>
      </div>
    </div>
  )
}
