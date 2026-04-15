import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const APP_URL = 'https://oneselect-ai-t6uo-phi.vercel.app'

function genTempPassword() {
  return 'OneSelect' + Math.random().toString(36).slice(2, 8).toUpperCase() + '!'
}

export default function AdminClients() {
  const navigate = useNavigate()
  const [clients, setClients]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [form, setForm]             = useState({ company_name: '', full_name: '', email: '' })
  const [inviting, setInviting]     = useState(false)
  const [inviteError, setInviteError]     = useState('')
  const [inviteSuccess, setInviteSuccess] = useState(null) // { email, tempPassword }
  const [copied, setCopied]         = useState(false)
  const [actionMsg, setActionMsg]   = useState({ text: '', ok: true })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)

    const { data: profiles, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_role', 'recruiter')
      .order('created_at', { ascending: false })

    if (profileErr || !profiles?.length) {
      setClients([])
      setLoading(false)
      return
    }

    const recruiterIds = profiles.map(p => p.id)
    const [{ data: jobs }] = await Promise.all([
      supabase.from('jobs').select('id, recruiter_id').in('recruiter_id', recruiterIds),
    ])

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
    ;(jobs ?? []).forEach(j => { jobsByRecruiter[j.recruiter_id] = (jobsByRecruiter[j.recruiter_id] ?? 0) + 1 })

    setClients(profiles.map(p => ({
      ...p,
      jobCount:       jobsByRecruiter[p.id] ?? 0,
      candidateCount: candsByRecruiter[p.id] ?? 0,
    })))
    setLoading(false)
  }

  function openInvite() {
    setForm({ company_name: '', full_name: '', email: '' })
    setInviteError('')
    setInviteSuccess(null)
    setCopied(false)
    setShowInvite(true)
  }

  function closeInvite() {
    setShowInvite(false)
    setInviteError('')
    setInviteSuccess(null)
    setCopied(false)
  }

  async function handleInvite(e) {
    e.preventDefault()
    setInviteError('')
    setInviteSuccess(null)
    setInviting(true)

    const email       = form.email
    const companyName = form.company_name
    const tempPassword = genTempPassword()

    try {
      // Create the user account with a temporary password
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password: tempPassword,
        options: { emailRedirectTo: `${APP_URL}/login` },
      })
      if (signUpError) throw signUpError
      if (!authData.user) throw new Error('User creation failed')

      // Insert their profile
      const { error: profileError } = await supabase.from('profiles').insert({
        id:           authData.user.id,
        user_role:    'recruiter',
        company_name: companyName,
        full_name:    form.full_name,
        email,
      })
      if (profileError) throw profileError

      setInviteSuccess({ email, companyName, tempPassword })
      await load()
    } catch (err) {
      setInviteError(err?.message ?? 'An unexpected error occurred')
    } finally {
      setInviting(false)
    }
  }

  function copyCredentials(creds) {
    const text =
      `OneSelect Login Details\n` +
      `URL: ${APP_URL}\n` +
      `Email: ${creds.email}\n` +
      `Temporary password: ${creds.tempPassword}\n\n` +
      `Please log in and change your password after first sign-in.`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  async function handleRemove(client) {
    const label = client.company_name || client.email
    if (!window.confirm(
      `Remove ${label}?\n\nThis removes them from your clients list. ` +
      `Their jobs and candidates are retained.\n\n` +
      `Note: delete their auth account from the Supabase dashboard if needed.`
    )) return
    setActionMsg({ text: '', ok: true })
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', client.id)
      if (error) throw error
      setClients(prev => prev.filter(c => c.id !== client.id))
      setActionMsg({ text: `${label} removed.`, ok: true })
      setTimeout(() => setActionMsg({ text: '', ok: true }), 4000)
    } catch (err) {
      setActionMsg({ text: `Error: ${err?.message ?? 'Failed to remove'}`, ok: false })
    }
  }

  if (loading) return <div className="page"><span className="spinner" /></div>

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
          background: actionMsg.ok ? 'var(--green-d)' : 'var(--red-d)',
          borderLeft: `2px solid ${actionMsg.ok ? 'var(--green)' : 'var(--red)'}`,
          fontSize: 13, color: actionMsg.ok ? 'var(--green)' : 'var(--red)',
        }}>
          {actionMsg.text}
        </div>
      )}

      <div className="section-card">
        <div className="section-card-head">
          <h3>All Clients</h3>
          <span className="mono text-muted" style={{ fontSize: 11 }}>{clients.length} total</span>
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
              <span>Status</span>
              <span>Joined</span>
              <span>Actions</span>
            </div>
            {clients.map(c => (
              <div key={c.id} className="client-table-row">
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text)' }}>{c.company_name ?? '—'}</div>
                  {c.full_name && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{c.full_name}</div>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{c.email}</div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: c.jobCount > 0 ? 'var(--text)' : 'var(--text-3)' }}>{c.jobCount}</div>
                <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: c.candidateCount > 0 ? 'var(--text)' : 'var(--text-3)' }}>{c.candidateCount}</div>
                <div>
                  <span className={`badge ${c.jobCount > 0 ? 'badge-green' : 'badge-amber'}`}>
                    {c.jobCount > 0 ? 'Active' : 'Pending'}
                  </span>
                </div>
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
            ))}
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
              {inviteSuccess ? (
                <div>
                  <div className="invite-success-icon" style={{ marginBottom: 12 }}>✓</div>
                  <div style={{ fontFamily: 'var(--font-head)', fontSize: 22, fontWeight: 400, marginBottom: 6, color: 'var(--text)' }}>
                    Account created
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>
                    Share these login details with <strong>{inviteSuccess.companyName}</strong> via email or WhatsApp:
                  </p>

                  {/* Credentials box */}
                  <div style={{
                    background: 'var(--surface2)', border: '1px solid var(--border)',
                    borderRadius: 'var(--r)', padding: '16px 18px', marginBottom: 16,
                    fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 2,
                    color: 'var(--text-2)',
                  }}>
                    <div><span style={{ color: 'var(--text-3)' }}>URL</span>{'  '}<span style={{ color: 'var(--text)' }}>{APP_URL}</span></div>
                    <div><span style={{ color: 'var(--text-3)' }}>Email</span>{'  '}<span style={{ color: 'var(--text)' }}>{inviteSuccess.email}</span></div>
                    <div>
                      <span style={{ color: 'var(--text-3)' }}>Password</span>{'  '}
                      <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{inviteSuccess.tempPassword}</span>
                    </div>
                  </div>

                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 20, lineHeight: 1.7 }}>
                    Ask them to change their password after first login.
                  </p>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1, justifyContent: 'center' }}
                      onClick={() => copyCredentials(inviteSuccess)}
                    >
                      {copied ? '✓ Copied!' : 'Copy to clipboard'}
                    </button>
                    <button className="btn btn-secondary" onClick={closeInvite}>
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleInvite}>
                  <div className="form-grid">
                    <div className="field">
                      <label>Company Name</label>
                      <input
                        type="text" required
                        placeholder="Acme Recruiting"
                        value={form.company_name}
                        onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                      />
                    </div>
                    <div className="field">
                      <label>Contact Name</label>
                      <input
                        type="text"
                        placeholder="Jane Smith"
                        value={form.full_name}
                        onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                      />
                    </div>
                    <div className="field span-2">
                      <label>Email Address</label>
                      <input
                        type="email" required
                        placeholder="jane@acmecorp.com"
                        value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      />
                    </div>
                  </div>
                  {inviteError && (
                    <div className="error-banner" style={{ marginTop: 14 }}>{inviteError}</div>
                  )}
                  <div className="form-actions" style={{ marginTop: 20 }}>
                    <button type="submit" className="btn btn-primary" disabled={inviting}>
                      {inviting
                        ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Creating account…</>
                        : 'Create Account'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={closeInvite}>
                      Cancel
                    </button>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 16, lineHeight: 1.7 }}>
                    A temporary password will be generated. Share it with the client so they can log in at{' '}
                    <span className="mono">{APP_URL}</span>
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
