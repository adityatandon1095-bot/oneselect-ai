import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

export default function AdminClients() {
  const navigate = useNavigate()

  // ── Page state ─────────────────────────────────────────────────────────
  const [clients,     setClients]     = useState([])
  const [pageLoading, setPageLoading] = useState(true)
  const [actionMsg,   setActionMsg]   = useState({ text: '', ok: true })

  // ── Invite form state ──────────────────────────────────────────────────
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [email,           setEmail]           = useState('')
  const [companyName,     setCompanyName]     = useState('')
  const [contactName,     setContactName]     = useState('')
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState('')
  const [inviteSuccess,   setInviteSuccess]   = useState(null) // { email, password, emailSent }

  useEffect(() => { loadClients() }, [])

  // ── Data loading ───────────────────────────────────────────────────────
  async function loadClients() {
    setPageLoading(true)

    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('user_role', 'recruiter')
      .order('created_at', { ascending: false })

    if (!profiles?.length) {
      setClients([])
      setPageLoading(false)
      return
    }

    const recruiterIds = profiles.map(p => p.id)
    const { data: jobs } = await supabase
      .from('jobs').select('id, recruiter_id').in('recruiter_id', recruiterIds)

    const jobsByRecruiter = {}
    const candsByRecruiter = {}

    ;(jobs ?? []).forEach(j => {
      jobsByRecruiter[j.recruiter_id] = (jobsByRecruiter[j.recruiter_id] ?? 0) + 1
    })

    const jobIds = (jobs ?? []).map(j => j.id)
    if (jobIds.length) {
      const { data: cands } = await supabase
        .from('candidates').select('job_id').in('job_id', jobIds)
      ;(cands ?? []).forEach(c => {
        const job = (jobs ?? []).find(j => j.id === c.job_id)
        if (job) candsByRecruiter[job.recruiter_id] = (candsByRecruiter[job.recruiter_id] ?? 0) + 1
      })
    }

    setClients(profiles.map(p => ({
      ...p,
      jobCount:       jobsByRecruiter[p.id] ?? 0,
      candidateCount: candsByRecruiter[p.id] ?? 0,
    })))
    setPageLoading(false)
  }

  // ── Invite ─────────────────────────────────────────────────────────────
  function openInvite() {
    setEmail('')
    setCompanyName('')
    setContactName('')
    setError('')
    setShowInviteModal(true)
  }

  function closeInvite() {
    setShowInviteModal(false)
    setError('')
  }

  const handleInvite = async () => {
    if (!companyName.trim()) { setError('Company name is required'); return }
    if (!email.trim())       { setError('Email is required'); return }

    setLoading(true)
    setError('')

    try {
      const tempPassword = 'OneSelect-' + Math.random().toString(36).slice(2, 8).toUpperCase()

      // Save admin session before signUp clobbers it
      const { data: adminSession } = await supabase.auth.getSession()
      const adminToken   = adminSession.session?.access_token
      const adminRefresh = adminSession.session?.refresh_token

      // Create the new user account
      const { data, error } = await supabase.auth.signUp({
        email:    email.trim().toLowerCase(),
        password: tempPassword,
      })
      if (error) throw error
      if (!data.user) throw new Error('No user created')
      const newUserId = data.user.id

      // Immediately restore admin session
      await supabase.auth.setSession({ access_token: adminToken, refresh_token: adminRefresh })

      // Insert recruiter profile using restored admin session
      const { error: profileError } = await supabase.from('profiles').insert({
        id:           newUserId,
        user_role:    'recruiter',
        company_name: companyName.trim(),
        email:        email.trim().toLowerCase(),
        full_name:    contactName.trim(),
        first_login:  true,
      })
      if (profileError) throw new Error('Profile error: ' + profileError.message)

      // Send welcome email via Resend
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + import.meta.env.VITE_RESEND_API_KEY,
        },
        body: JSON.stringify({
          from:    'One Select <noreply@oneselect.ai>',
          to:      [email.trim().toLowerCase()],
          subject: 'Welcome to One Select — Your Portal is Ready',
          html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#F8F7F4;padding:40px;">
            <div style="text-align:center;padding:32px 0;border-bottom:1px solid #E8E4DC;margin-bottom:32px;">
              <h1 style="color:#B8924A;font-weight:300;letter-spacing:0.15em;font-size:28px;margin:0;">ONE SELECT</h1>
              <p style="color:#9CA3AF;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin:8px 0 0;">Strategic Talent Solutions</p>
            </div>
            <div style="background:white;padding:40px;border:1px solid #E8E4DC;">
              <h2 style="color:#2D3748;font-weight:400;font-size:22px;margin:0 0 16px;">Welcome, ${contactName.trim()}!</h2>
              <p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 24px;">Your AI-powered hiring portal is ready for <strong>${companyName.trim()}</strong>. Log in to create your first job posting and our team will handle the rest.</p>
              <div style="background:#F8F7F4;border-left:4px solid #B8924A;padding:24px;margin:24px 0;">
                <p style="margin:0 0 12px;color:#6B7280;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;">Your Login Details</p>
                <p style="margin:0 0 8px;color:#2D3748;"><strong>Portal:</strong> <a href="https://oneselect-ai-t6uo-phi.vercel.app" style="color:#B8924A;">oneselect-ai-t6uo-phi.vercel.app</a></p>
                <p style="margin:0 0 8px;color:#2D3748;"><strong>Email:</strong> ${email.trim().toLowerCase()}</p>
                <p style="margin:0;color:#2D3748;"><strong>Password:</strong> <span style="font-family:monospace;font-size:20px;color:#B8924A;font-weight:bold;">${tempPassword}</span></p>
              </div>
              <div style="text-align:center;margin:32px 0;">
                <a href="https://oneselect-ai-t6uo-phi.vercel.app" style="background:#B8924A;color:white;padding:14px 40px;text-decoration:none;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;">ACCESS YOUR PORTAL →</a>
              </div>
            </div>
          </div>`,
        }),
      })
      const emailData = await emailRes.json()
      console.log('Email result:', emailData)

      setInviteSuccess({ email: email.trim().toLowerCase(), password: tempPassword, emailSent: emailRes.ok })
      setShowInviteModal(false)
      await loadClients()

    } catch (err) {
      console.error('Invite error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
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

  // ── Copy login details ─────────────────────────────────────────────────
  function copyLoginDetails() {
    if (!inviteSuccess) return
    const text =
      `One Select Portal Login\n` +
      `Portal:   https://oneselect-ai-t6uo-phi.vercel.app\n` +
      `Email:    ${inviteSuccess.email}\n` +
      `Password: ${inviteSuccess.password}`
    navigator.clipboard.writeText(text).catch(() => {})
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
      {showInviteModal && (
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
                <button className="btn btn-primary" disabled={loading} onClick={handleInvite}>
                  {loading
                    ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Sending invitation…</>
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

      {/* ── Success Modal — no outside-click dismiss ── */}
      {inviteSuccess && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-head"><h3>Client Invited!</h3></div>
            <div className="modal-body">
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'var(--green-d)', border: '1px solid var(--green)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 26, color: 'var(--green)',
                }}>✓</div>
              </div>

              <div style={{
                padding: '10px 14px', marginBottom: 20, fontSize: 13,
                background: inviteSuccess.emailSent ? 'var(--green-d)' : 'var(--amber-d)',
                borderLeft: `2px solid ${inviteSuccess.emailSent ? 'var(--green)' : 'var(--amber)'}`,
                color: inviteSuccess.emailSent ? 'var(--green)' : 'var(--amber)',
              }}>
                {inviteSuccess.emailSent
                  ? `Email sent to ${inviteSuccess.email}`
                  : 'Email delivery failed — share login details below manually'}
              </div>

              <div style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 'var(--r)', padding: '16px 20px', marginBottom: 20,
              }}>
                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-3)', marginBottom: 14 }}>
                  Login Details
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', width: 72, flexShrink: 0 }}>Email</span>
                    <span style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{inviteSuccess.email}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', width: 72, flexShrink: 0 }}>Password</span>
                    <span style={{ fontSize: 22, color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.15em' }}>
                      {inviteSuccess.password}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={copyLoginDetails}>
                  Copy Login Details
                </button>
                <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setInviteSuccess(null)}>
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
