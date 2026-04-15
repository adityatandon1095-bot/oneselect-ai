import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const APP_URL     = 'https://oneselect-ai-t6uo-phi.vercel.app'
const ADMIN_EMAIL = 'aditya.tandon1095@gmail.com'

function genTempPassword() {
  return (
    'OS-' +
    Math.random().toString(36).slice(2, 6).toUpperCase() +
    '-' +
    Math.floor(1000 + Math.random() * 9000)
  )
}

async function sendResendEmail(to, subject, html) {
  const key = import.meta.env.VITE_RESEND_API_KEY
  if (!key) return { ok: false, reason: 'VITE_RESEND_API_KEY not set' }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body:    JSON.stringify({
        from: 'One Select <onboarding@resend.dev>',
        to:   [to],
        subject,
        html,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { ok: false, reason: body?.message ?? String(res.status) }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e.message }
  }
}

function buildWelcomeHtml(contactName, companyName, email, tempPassword) {
  return `
<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#F8F7F4;padding:40px;">
  <div style="text-align:center;padding:32px 0;border-bottom:1px solid #E8E4DC;margin-bottom:32px;">
    <h1 style="font-family:Georgia,serif;color:#B8924A;font-weight:300;letter-spacing:0.15em;font-size:28px;margin:0;">ONE SELECT</h1>
    <p style="color:#9CA3AF;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin:8px 0 0;">Strategic Talent Solutions</p>
  </div>
  <div style="background:white;padding:40px;border:1px solid #E8E4DC;">
    <h2 style="font-family:Georgia,serif;color:#2D3748;font-weight:400;font-size:22px;margin:0 0 16px;">Welcome, ${contactName || companyName}</h2>
    <p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 24px;">
      Your AI-powered hiring portal has been set up for <strong style="color:#2D3748;">${companyName}</strong>.
      Log in to define your open roles, and our team will handle the rest —
      screening CVs and conducting first-round interviews using AI.
    </p>
    <div style="background:#F8F7F4;border:1px solid #E8E4DC;border-left:4px solid #B8924A;padding:24px;margin:24px 0;">
      <p style="margin:0 0 16px;color:#6B7280;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-family:monospace;">Your Login Details</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#6B7280;font-size:14px;width:120px;">Portal</td>
            <td style="padding:6px 0;"><a href="${APP_URL}" style="color:#B8924A;font-size:14px;">${APP_URL}</a></td></tr>
        <tr><td style="padding:6px 0;color:#6B7280;font-size:14px;">Email</td>
            <td style="padding:6px 0;color:#2D3748;font-size:14px;">${email}</td></tr>
        <tr><td style="padding:6px 0;color:#6B7280;font-size:14px;">Password</td>
            <td style="padding:6px 0;"><span style="font-family:monospace;font-size:20px;color:#B8924A;font-weight:bold;letter-spacing:0.1em;">${tempPassword}</span></td></tr>
      </table>
    </div>
    <div style="text-align:center;margin:32px 0;">
      <a href="${APP_URL}" style="background:#B8924A;color:white;padding:14px 40px;text-decoration:none;font-family:monospace;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;display:inline-block;">ACCESS YOUR PORTAL →</a>
    </div>
    <p style="color:#9CA3AF;font-size:13px;line-height:1.6;margin:24px 0 0;padding-top:24px;border-top:1px solid #E8E4DC;">
      For security, please change your password after your first login.
      If you need any help, contact your One Select account manager.
    </p>
  </div>
  <p style="text-align:center;color:#9CA3AF;font-size:11px;margin-top:24px;letter-spacing:0.08em;">ONE SELECT — STRATEGIC TALENT SOLUTIONS</p>
</div>`
}

function buildAdminNotifHtml(contactName, companyName, email) {
  return `
<div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:32px;background:#ffffff;">
  <h2 style="color:#B8924A;margin:0 0 20px;font-size:20px;">New Client Invited</h2>
  <p style="color:#374151;line-height:1.8;font-size:15px;margin:0 0 16px;">
    <strong>${contactName || 'A new contact'}</strong> from <strong>${companyName}</strong>
    has been invited to One Select.
  </p>
  <p style="color:#374151;line-height:1.8;font-size:15px;margin:0 0 16px;">
    Their account has been created and login credentials sent to
    <strong>${email}</strong>.
    They can now access their portal at
    <a href="${APP_URL}" style="color:#B8924A;">${APP_URL}</a>.
  </p>
  <p style="color:#9CA3AF;font-size:12px;margin-top:32px;padding-top:16px;border-top:1px solid #E8E4DC;">
    One Select Admin System
  </p>
</div>`
}

export default function AdminClients() {
  const navigate = useNavigate()

  // ── Page state ─────────────────────────────────────────────────────────
  const [clients,     setClients]     = useState([])
  const [pageLoading, setPageLoading] = useState(true)
  const [actionMsg,   setActionMsg]   = useState({ text: '', ok: true })

  // ── Invite form state ──────────────────────────────────────────────────
  const [showInvite,  setShowInvite]  = useState(false)
  const [email,       setEmail]       = useState('')
  const [companyName, setCompanyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [inviting,    setInviting]    = useState(false)
  const [error,       setError]       = useState('')

  // ── Success / error modal state ────────────────────────────────────────
  const [result,      setResult]      = useState(null)
  // result = { email, company, contact, emailSent, emailErr, tempPassword }
  const [showResult,  setShowResult]  = useState(false)
  const [copied,      setCopied]      = useState(false)

  useEffect(() => { loadClients() }, [])

  // ── Data loading ───────────────────────────────────────────────────────
  async function loadClients() {
    setPageLoading(true)

    const { data: profiles, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_role', 'recruiter')
      .order('created_at', { ascending: false })

    if (profileErr || !profiles?.length) {
      setClients([])
      setPageLoading(false)
      return
    }

    const recruiterIds = profiles.map(p => p.id)
    const { data: jobs } = await supabase
      .from('jobs').select('id, recruiter_id').in('recruiter_id', recruiterIds)

    const jobIds = (jobs ?? []).map(j => j.id)
    const candsByRecruiter = {}
    if (jobIds.length) {
      const { data: cands } = await supabase
        .from('candidates').select('job_id').in('job_id', jobIds)
      ;(cands ?? []).forEach(c => {
        const job = (jobs ?? []).find(j => j.id === c.job_id)
        if (job) candsByRecruiter[job.recruiter_id] = (candsByRecruiter[job.recruiter_id] ?? 0) + 1
      })
    }

    const jobsByRecruiter = {}
    ;(jobs ?? []).forEach(j => {
      jobsByRecruiter[j.recruiter_id] = (jobsByRecruiter[j.recruiter_id] ?? 0) + 1
    })

    setClients(profiles.map(p => ({
      ...p,
      jobCount:       jobsByRecruiter[p.id] ?? 0,
      candidateCount: candsByRecruiter[p.id] ?? 0,
    })))
    setPageLoading(false)
  }

  // ── Invite handlers ────────────────────────────────────────────────────
  function openInvite() {
    setEmail('')
    setCompanyName('')
    setContactName('')
    setError('')
    setShowInvite(true)
  }

  function closeInvite() {
    setShowInvite(false)
    setError('')
  }

  async function handleInvite() {
    if (!companyName.trim() || !email.trim()) {
      setError('Company name and email are required')
      return
    }

    setInviting(true)
    setError('')

    const cleanEmail   = email.trim().toLowerCase()
    const cleanCompany = companyName.trim()
    const cleanContact = contactName.trim()
    const tempPassword = genTempPassword()

    try {
      // 1. Create auth user
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email:    cleanEmail,
        password: tempPassword,
      })

      if (signUpError) { setError(signUpError.message); return }
      if (!authData?.user?.id) { setError('User creation failed — please try again'); return }

      // 2. Insert profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id:           authData.user.id,
          user_role:    'recruiter',
          company_name: cleanCompany,
          full_name:    cleanContact,
          email:        cleanEmail,
          first_login:  true,
        })

      if (profileError) {
        setError('Account created but profile setup failed: ' + profileError.message)
        return
      }

      // 3. Send welcome email to client
      const clientEmail = await sendResendEmail(
        cleanEmail,
        'Welcome to One Select — Your Portal is Ready',
        buildWelcomeHtml(cleanContact, cleanCompany, cleanEmail, tempPassword)
      )

      // 4. Send admin notification
      await sendResendEmail(
        ADMIN_EMAIL,
        `New client invited — ${cleanCompany}`,
        buildAdminNotifHtml(cleanContact, cleanCompany, cleanEmail)
      )

      // 5. Show result modal
      setResult({
        email:     cleanEmail,
        company:   cleanCompany,
        contact:   cleanContact,
        emailSent: clientEmail.ok,
        emailErr:  clientEmail.reason,
        tempPassword,
      })
      setCopied(false)
      setShowInvite(false)
      setShowResult(true)
      await loadClients()
    } catch (err) {
      console.error('Invite error:', err)
      setError('Unexpected error: ' + err.message)
    } finally {
      setInviting(false)
    }
  }

  function copyCredentials() {
    if (!result) return
    const text =
      `One Select Portal\n` +
      `URL: ${APP_URL}\n` +
      `Email: ${result.email}\n` +
      `Temporary Password: ${result.tempPassword}`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  // ── Remove ─────────────────────────────────────────────────────────────
  async function handleRemove(client) {
    const label = client.company_name || client.email
    if (!window.confirm(
      `Remove ${label}?\n\nThis removes them from your clients list. ` +
      `Their jobs and candidates are retained.\n\n` +
      `Delete their auth account from the Supabase dashboard if needed.`
    )) return
    setActionMsg({ text: '', ok: true })
    try {
      const { error: delErr } = await supabase.from('profiles').delete().eq('id', client.id)
      if (delErr) throw delErr
      setClients(prev => prev.filter(c => c.id !== client.id))
      setActionMsg({ text: `${label} removed.`, ok: true })
      setTimeout(() => setActionMsg({ text: '', ok: true }), 4000)
    } catch (err) {
      setActionMsg({ text: `Error: ${err?.message ?? 'Failed to remove'}`, ok: false })
    }
  }

  // ── Login status badge ─────────────────────────────────────────────────
  function loginStatus(client) {
    if (!client.first_login_at) return { label: 'Never logged in', cls: 'badge-amber' }
    if (client.last_seen_at) {
      const d   = new Date(client.last_seen_at)
      const ago = Math.round((Date.now() - d) / 86400000)
      const when = ago === 0 ? 'today' :
                   ago === 1 ? 'yesterday' :
                   d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      return { label: `Active · ${when}`, cls: 'badge-green' }
    }
    return { label: 'Logged in', cls: 'badge-green' }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  if (pageLoading) return <div className="page"><span className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Clients</h2>
          <p>{clients.length} recruiter account{clients.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={openInvite}>+ Invite Client</button>
      </div>

      {actionMsg.text && (
        <div style={{
          marginBottom: 16, padding: '11px 16px',
          background:   actionMsg.ok ? 'var(--green-d)' : 'var(--red-d)',
          borderLeft:   `2px solid ${actionMsg.ok ? 'var(--green)' : 'var(--red)'}`,
          fontSize: 13, color: actionMsg.ok ? 'var(--green)' : 'var(--red)',
        }}>
          {actionMsg.text}
        </div>
      )}

      {/* ── Client table ── */}
      <div className="section-card">
        <div className="section-card-head">
          <h3>All Clients</h3>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{clients.length} total</span>
        </div>

        {clients.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.3 }}>◉</div>
            <div style={{ fontWeight: 400, color: 'var(--text-2)', marginBottom: 6 }}>No clients yet</div>
            <div style={{ fontSize: 12, marginBottom: 16 }}>Invite your first recruiter client to get started.</div>
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={openInvite}>+ Invite Client</button>
          </div>
        ) : (
          <>
            <div className="client-table-head">
              <span>Company</span>
              <span>Email</span>
              <span style={{ textAlign: 'right' }}>Jobs</span>
              <span style={{ textAlign: 'right' }}>Candidates</span>
              <span>Portal Status</span>
              <span>Joined</span>
              <span>Actions</span>
            </div>
            {clients.map(c => {
              const ls = loginStatus(c)
              return (
                <div key={c.id} className="client-table-row">
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text)' }}>{c.company_name ?? '—'}</div>
                    {c.full_name && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{c.full_name}</div>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{c.email}</div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: c.jobCount > 0 ? 'var(--text)' : 'var(--text-3)' }}>{c.jobCount}</div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: c.candidateCount > 0 ? 'var(--text)' : 'var(--text-3)' }}>{c.candidateCount}</div>
                  <div><span className={`badge ${ls.cls}`} style={{ fontSize: 10 }}>{ls.label}</span></div>
                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
                    {new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 10, padding: '3px 8px' }}
                      onClick={() => navigate('/admin/jobs', { state: { clientId: c.id, clientName: c.company_name || c.email } })}
                    >
                      View Jobs
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 10, padding: '3px 8px', color: 'var(--red)' }}
                      onClick={() => handleRemove(c)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* ── Invite Modal ── */}
      {showInvite && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) closeInvite() }}>
          <div className="modal">
            <div className="modal-head">
              <h3>Invite New Client</h3>
              <button className="modal-close" onClick={closeInvite}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field">
                  <label>Company Name *</label>
                  <input
                    type="text"
                    placeholder="Acme Recruiting"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="field">
                  <label>Contact Name</label>
                  <input
                    type="text"
                    placeholder="Jane Smith"
                    value={contactName}
                    onChange={e => setContactName(e.target.value)}
                  />
                </div>
                <div className="field span-2">
                  <label>Email Address *</label>
                  <input
                    type="email"
                    placeholder="jane@acmecorp.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleInvite() } }}
                  />
                </div>
              </div>

              {error && <div className="error-banner" style={{ marginTop: 14 }}>{error}</div>}

              <div className="form-actions" style={{ marginTop: 20 }}>
                <button className="btn btn-primary" disabled={inviting} onClick={handleInvite}>
                  {inviting
                    ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Sending Invitation…</>
                    : 'Send Invitation'}
                </button>
                <button className="btn btn-secondary" onClick={closeInvite}>Cancel</button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 16, lineHeight: 1.7 }}>
                We'll create their account and send a branded welcome email with login instructions.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Result Modal (success or email-failure fallback) ── */}
      {showResult && result && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-head">
              <h3>{result.emailSent ? 'Invitation Sent Successfully' : 'Account Created'}</h3>
            </div>
            <div className="modal-body">
              {result.emailSent ? (
                <>
                  {/* ── Email sent: success screen ── */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
                    padding: '14px 16px', background: 'var(--green-d)',
                    border: '1px solid var(--green)', borderRadius: 'var(--r)',
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: 'var(--green)', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', flexShrink: 0, fontSize: 16, color: '#fff',
                    }}>✓</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)' }}>Invitation Sent Successfully</div>
                      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>Account created and welcome email delivered</div>
                    </div>
                  </div>

                  <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 16 }}>
                    A welcome email with login credentials has been sent to{' '}
                    <span className="mono" style={{ color: 'var(--text)' }}>{result.email}</span>.
                  </p>

                  <div style={{
                    padding: '10px 14px', marginBottom: 24,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 'var(--r)', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6,
                  }}>
                    You'll receive a notification when they first log in.
                  </div>

                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', background: 'var(--accent)', borderColor: 'var(--accent)' }}
                    onClick={() => { setShowResult(false); setResult(null) }}
                  >
                    Done
                  </button>
                </>
              ) : (
                <>
                  {/* ── Email failed: show credentials manually ── */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
                    padding: '12px 14px', background: 'var(--amber-d)',
                    border: '1px solid var(--amber)', borderRadius: 'var(--r)',
                  }}>
                    <span style={{ fontSize: 16 }}>⚠</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--amber)' }}>Account created. Email delivery failed.</div>
                      {result.emailErr && (
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{result.emailErr}</div>
                      )}
                    </div>
                  </div>

                  <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.6 }}>
                    Share these credentials manually with <strong>{result.contact || result.company}</strong>:
                  </p>

                  <div style={{
                    background: 'var(--surface2)', border: '1px solid var(--border)',
                    borderRadius: 'var(--r)', padding: '16px 18px', marginBottom: 16,
                    fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 2.2,
                  }}>
                    <div>
                      <span style={{ color: 'var(--text-3)', minWidth: 72, display: 'inline-block' }}>Email</span>
                      <span style={{ color: 'var(--text)' }}>{result.email}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-3)', minWidth: 72, display: 'inline-block' }}>Password</span>
                      <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 15, letterSpacing: '0.06em' }}>
                        {result.tempPassword}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-3)', minWidth: 72, display: 'inline-block' }}>Portal</span>
                      <span style={{ color: 'var(--text)' }}>{APP_URL}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1, justifyContent: 'center' }}
                      onClick={copyCredentials}
                    >
                      {copied ? '✓ Copied!' : 'Copy Credentials'}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => { setShowResult(false); setResult(null) }}
                    >
                      Done
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
