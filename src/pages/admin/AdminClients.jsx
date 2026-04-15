import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const APP_URL     = 'https://oneselect-ai-t6uo-phi.vercel.app'
const EDGE_URL    = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
const EDGE_HEADERS = {
  'Content-Type':  'application/json',
  'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
}

async function edgeFn(name, body) {
  const res = await fetch(`${EDGE_URL}/${name}`, {
    method:  'POST',
    headers: EDGE_HEADERS,
    body:    JSON.stringify(body),
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error)
  return json
}

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
    setInviteError('')
    setInviteSuccess('')
    setInviting(true)

    const email       = form.email
    const companyName = form.company_name
    const contactName = form.full_name

    try {
      const { data: { session } } = await supabase.auth.getSession()

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ email, company_name: companyName, contact_name: contactName }),
        }
      )

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Invitation failed')
      if (result.error)  throw new Error(result.error)

      setInviteSuccess(`Invitation sent to ${email}`)
      await load()
      setTimeout(closeInvite, 2400)
    } catch (err) {
      setInviteError(err?.message ?? 'An unexpected error occurred')
    } finally {
      setInviting(false)
    }
  }

  async function handleResendInvite(client) {
    setActionMsg({ text: '', ok: true })
    try {
      await edgeFn('invite-user', {
        email:        client.email,
        company_name: client.company_name ?? '',
        contact_name: client.full_name ?? '',
      })
      setActionMsg({ text: `Invitation resent to ${client.email}`, ok: true })
      setTimeout(() => setActionMsg({ text: '', ok: true }), 4000)
    } catch (err) {
      setActionMsg({ text: `Error: ${err?.message ?? 'Failed to resend'}`, ok: false })
    }
  }

  async function handleRemove(client) {
    const label = client.company_name || client.email
    if (!window.confirm(`Remove ${label}?\n\nTheir account will be deleted. Jobs and candidates are retained.`)) return
    setActionMsg({ text: '', ok: true })
    try {
      await edgeFn('delete-user', { user_id: client.id })
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
