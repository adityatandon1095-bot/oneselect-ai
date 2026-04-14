import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

const APP_URL = 'https://oneselect-ai-t6uo-phi.vercel.app'

export default function AdminClients() {
  const navigate = useNavigate()
  const [clients, setClients]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [form, setForm]             = useState({ company_name: '', full_name: '', email: '' })
  const [inviting, setInviting]     = useState(false)
  const [inviteError, setInviteError]     = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [actionMsg, setActionMsg]   = useState({ text: '', ok: true })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)

    const { data: profiles, error: profileErr } = await supabaseAdmin
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

    // Fetch jobs, auth users in parallel
    const [
      { data: jobs },
      { data: authData },
    ] = await Promise.all([
      supabaseAdmin.from('jobs').select('id, recruiter_id').in('recruiter_id', recruiterIds),
      supabaseAdmin.auth.admin.listUsers({ perPage: 200 }),
    ])

    const jobIds = (jobs ?? []).map(j => j.id)

    // Candidate counts per recruiter (via job_id → recruiter_id)
    const candsByRecruiter = {}
    if (jobIds.length) {
      const { data: cands } = await supabaseAdmin
        .from('candidates')
        .select('job_id')
        .in('job_id', jobIds)
      ;(cands ?? []).forEach(c => {
        const job = (jobs ?? []).find(j => j.id === c.job_id)
        if (job) candsByRecruiter[job.recruiter_id] = (candsByRecruiter[job.recruiter_id] ?? 0) + 1
      })
    }

    const jobsByRecruiter = {}
    ;(jobs ?? []).forEach(j => { jobsByRecruiter[j.recruiter_id] = (jobsByRecruiter[j.recruiter_id] ?? 0) + 1 })

    const userMap = Object.fromEntries((authData?.users ?? []).map(u => [u.id, u]))

    setClients(profiles.map(p => ({
      ...p,
      jobCount:       jobsByRecruiter[p.id] ?? 0,
      candidateCount: candsByRecruiter[p.id] ?? 0,
      hasLoggedIn:    !!(userMap[p.id]?.last_sign_in_at),
    })))
    setLoading(false)
  }

  function openInvite() {
    setForm({ company_name: '', full_name: '', email: '' })
    setInviteError('')
    setInviteSuccess('')
    setShowInvite(true)
  }

  function closeInvite() {
    setShowInvite(false)
    setInviteError('')
    setInviteSuccess('')
  }

  async function handleInvite(e) {
    e.preventDefault()
    setInviting(true)
    setInviteError('')
    setInviteSuccess('')

    try {
      // Create auth user + trigger invite email
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(form.email, {
        redirectTo: `${APP_URL}/login`,
      })
      if (error) throw error

      // Insert profile row (upsert in case a trigger already created it)
      const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
        id:           data.user.id,
        email:        form.email,
        full_name:    form.full_name,
        company_name: form.company_name,
        user_role:    'recruiter',
      }, { onConflict: 'id' })
      if (profileError) throw profileError

      setInviteSuccess(`Invitation sent to ${form.email}`)

      // Optimistically add to list
      setClients(prev => [{
        id:             data.user.id,
        email:          form.email,
        full_name:      form.full_name,
        company_name:   form.company_name,
        user_role:      'recruiter',
        created_at:     new Date().toISOString(),
        jobCount:       0,
        candidateCount: 0,
        hasLoggedIn:    false,
      }, ...prev])

      setTimeout(closeInvite, 2400)
    } catch (err) {
      setInviteError(err.message)
    }
    setInviting(false)
  }

  async function handleResendInvite(client) {
    setActionMsg({ text: '', ok: true })
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(client.email, {
      redirectTo: `${APP_URL}/login`,
    })
    if (error) {
      setActionMsg({ text: `Error: ${error.message}`, ok: false })
    } else {
      setActionMsg({ text: `Invitation resent to ${client.email}`, ok: true })
      setTimeout(() => setActionMsg({ text: '', ok: true }), 4000)
    }
  }

  async function handleRemove(client) {
    const label = client.company_name || client.email
    if (!window.confirm(`Remove ${label}?\n\nTheir account will be deleted. Jobs and candidates are retained.`)) return
    setActionMsg({ text: '', ok: true })
    const { error } = await supabaseAdmin.auth.admin.deleteUser(client.id)
    if (error) {
      setActionMsg({ text: `Error: ${error.message}`, ok: false })
    } else {
      setClients(prev => prev.filter(c => c.id !== client.id))
      setActionMsg({ text: `${label} removed.`, ok: true })
      setTimeout(() => setActionMsg({ text: '', ok: true }), 4000)
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
              <span>Invited</span>
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
                  <span className={`badge ${c.hasLoggedIn ? 'badge-green' : 'badge-amber'}`}>
                    {c.hasLoggedIn ? 'Active' : 'Pending'}
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
                    style={{ fontSize: 10, padding: '3px 8px' }}
                    onClick={() => handleResendInvite(c)}
                    title="Resend invitation email"
                  >
                    Resend
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 10, padding: '3px 8px', color: 'var(--red)' }}
                    onClick={() => handleRemove(c)}
                    title="Delete client account"
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
                <div className="invite-success">
                  <div className="invite-success-icon">✓</div>
                  <div style={{ fontFamily: 'var(--font-head)', fontSize: 24, fontWeight: 400, marginBottom: 8, color: 'var(--text)' }}>
                    Invitation sent
                  </div>
                  <p style={{ color: 'var(--text-2)', marginBottom: 8 }}>{inviteSuccess}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.7 }}>
                    They'll receive an email with a link to set their password and access the portal at{' '}
                    <span className="mono">{APP_URL}</span>
                  </p>
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
                        type="text" required
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
                        ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Sending…</>
                        : 'Send Invitation'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={closeInvite}>
                      Cancel
                    </button>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 16, lineHeight: 1.7 }}>
                    An invitation email will be sent with a link to set their password.
                    Portal URL: <span className="mono">{APP_URL}</span>
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
