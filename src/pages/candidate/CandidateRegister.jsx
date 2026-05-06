import { useState, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import mammoth from 'mammoth'
import { supabase } from '../../lib/supabase'
import { extractContent, isSupported, fileExt, ACCEPT_ATTR } from '../../utils/fileExtract'
import TagInput from '../../components/TagInput'

const CV_PARSE_SYSTEM = `You are a CV parser. Return ONLY valid JSON — no markdown:
{"name":"string","email":"string","currentRole":"string","totalYears":number,"skills":["..."],"education":"string","summary":"string","highlights":["..."],"linkedinUrl":"string or null"}`

async function callClaudePublic(messages, systemPrompt, maxTokens = 1000) {
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/call-claude`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ messages, systemPrompt, maxTokens }),
  })
  const d = await res.json()
  if (!res.ok || d.error) throw new Error(d.error || 'API error')
  return d.text
}

export default function CandidateRegister() {
  const navigate = useNavigate()
  const fileInputRef = useRef()

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
  const [step,        setStep]        = useState('form') // 'form' | 'processing' | 'done' | 'confirm_email'
  const [statusMsg,   setStatusMsg]   = useState('')
  const [error,       setError]       = useState('')

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

    setStep('processing')
    setStatusMsg('Creating your account…')

    try {
      // Step 1: Create auth user
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { role: 'candidate', full_name: fullName.trim() } },
      })
      if (authErr) throw new Error(authErr.message)

      const userId = authData.user?.id
      if (!userId) throw new Error('Account creation failed — please try again.')

      // Step 2: Insert profile
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

      // Step 3: Parse CV if uploaded
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
          const msgs = content.kind === 'image'
            ? [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: content.mediaType, data: content.base64 } }, { type: 'text', text: 'Parse this CV image.' }] }]
            : [{ role: 'user', content: `Parse this CV:\n\n${content.text}` }]
          const reply = await callClaudePublic(msgs, CV_PARSE_SYSTEM, 1024)
          parsed = JSON.parse(reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
        } catch (cvErr) {
          console.warn('CV parse error (non-fatal):', cvErr.message)
        }
      }

      // Step 4: Insert to talent_pool
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

      // Check if session is available (email confirmation may or may not be required)
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

  if (step === 'processing') {
    return (
      <div className="login-screen">
        <div className="login-panel-left">
          <p className="login-tagline-label">Talent Network</p>
          <div className="login-divider" />
          <p className="login-quote">Find your next role. We match you to the right opportunities.</p>
        </div>
        <div className="login-panel-right">
          <div className="login-form-wrap" style={{ textAlign: 'center' }}>
            <img src="/oneselect-logo.png" alt="One Select" style={{ width: 200, height: 'auto', objectFit: 'contain', marginBottom: 36, display: 'block' }} />
            <span className="spinner" style={{ width: 32, height: 32, margin: '0 auto 20px', display: 'block' }} />
            <h2 className="login-welcome" style={{ marginBottom: 8 }}>Setting up your profile</h2>
            <p style={{ fontSize: 14, color: 'var(--text-3)' }}>{statusMsg}</p>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="login-screen">
        <div className="login-panel-left">
          <p className="login-tagline-label">Talent Network</p>
          <div className="login-divider" />
          <p className="login-quote">Find your next role. We match you to the right opportunities.</p>
        </div>
        <div className="login-panel-right">
          <div className="login-form-wrap" style={{ textAlign: 'center' }}>
            <img src="/oneselect-logo.png" alt="One Select" style={{ width: 200, height: 'auto', objectFit: 'contain', marginBottom: 36, display: 'block' }} />
            <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3, fontFamily: 'var(--font-head)' }}>◈</div>
            <h2 className="login-welcome">You're in the network.</h2>
            <p className="login-sub" style={{ marginBottom: 28, lineHeight: 1.7 }}>
              Your profile has been created. You'll be matched to relevant roles automatically.
              We'll be in touch when you match a role.
            </p>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate('/candidate/dashboard')}>
              Go to your dashboard →
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'confirm_email') {
    return (
      <div className="login-screen">
        <div className="login-panel-left">
          <p className="login-tagline-label">Talent Network</p>
          <div className="login-divider" />
          <p className="login-quote">Find your next role. We match you to the right opportunities.</p>
        </div>
        <div className="login-panel-right">
          <div className="login-form-wrap" style={{ textAlign: 'center' }}>
            <img src="/oneselect-logo.png" alt="One Select" style={{ width: 200, height: 'auto', objectFit: 'contain', marginBottom: 36, display: 'block' }} />
            <div style={{ fontSize: 40, marginBottom: 16 }}>✉</div>
            <h2 className="login-welcome">Check your email</h2>
            <p className="login-sub" style={{ marginBottom: 28, lineHeight: 1.7 }}>
              We've sent a confirmation link to <strong>{email}</strong>. Click the link to activate your account, then sign in to see your matches.
            </p>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate('/candidate/login')}>
              Sign in →
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="login-screen" style={{ alignItems: 'flex-start', overflowY: 'auto' }}>
      <div className="login-panel-left" style={{ position: 'sticky', top: 0, alignSelf: 'flex-start' }}>
        <p className="login-tagline-label">Talent Network</p>
        <div className="login-divider" />
        <p className="login-quote">Find your next role. We match you to the right opportunities.</p>
      </div>

      <div className="login-panel-right" style={{ overflowY: 'auto', maxHeight: '100vh' }}>
        <div className="login-form-wrap" style={{ paddingTop: 40, paddingBottom: 40 }}>
          <img src="/oneselect-logo.png" alt="One Select" style={{ width: 200, height: 'auto', objectFit: 'contain', marginBottom: 32, display: 'block' }} />

          <h2 className="login-welcome">Join our talent network</h2>
          <p className="login-sub">Create your profile to get matched to relevant roles</p>

          {error && <div className="error-banner">{error}</div>}

          <form className="login-form" onSubmit={handleSubmit} style={{ gap: 14 }}>
            <div className="field">
              <label>Full Name *</label>
              <input type="text" required autoFocus value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" />
            </div>
            <div className="field">
              <label>Email *</label>
              <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" />
            </div>
            <div className="field">
              <label>Phone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+44 7700 900123" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
              <div className="field">
                <label>Current Role / Title</label>
                <input type="text" value={currentRole} onChange={e => setCurrentRole(e.target.value)} placeholder="Senior Software Engineer" />
              </div>
              <div className="field">
                <label>Years Experience</label>
                <input type="number" min={0} max={40} value={totalYears} onChange={e => setTotalYears(e.target.value)} placeholder="5" />
              </div>
            </div>
            <div className="field">
              <label>Skills</label>
              <TagInput value={skills} onChange={setSkills} placeholder="Type a skill and press Enter…" />
            </div>
            <div className="field">
              <label>LinkedIn URL (optional)</label>
              <input type="url" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/yourname" />
            </div>

            <div className="field">
              <label>Upload CV (optional)</label>
              <div
                style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: '14px 16px', cursor: 'pointer', fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}
                onClick={() => fileInputRef.current?.click()}
              >
                {cvFile ? (
                  <span style={{ color: 'var(--text)' }}>📄 {cvFile.name} <span style={{ color: 'var(--green)', marginLeft: 6 }}>✓</span></span>
                ) : (
                  <>Drop or <span style={{ color: 'var(--accent)', textDecoration: 'underline' }}>browse</span> — PDF, DOCX or TXT</>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept={ACCEPT_ATTR} style={{ display: 'none' }} onChange={handleFileChange} />
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5 }}>We'll use your CV to auto-fill your profile and improve job matching</p>
            </div>

            <div className="field">
              <label>Password *</label>
              <input type="password" required autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </div>
            <div className="field">
              <label>Confirm Password *</label>
              <input type="password" required autoComplete="new-password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat your password" />
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: 4 }}>
              Create Profile
            </button>
          </form>

          <p style={{ marginTop: 20, fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>
            Already have an account?{' '}
            <Link to="/candidate/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
