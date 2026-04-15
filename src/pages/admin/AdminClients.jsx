import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const APP_URL = 'https://oneselect-ai-t6uo-phi.vercel.app'


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
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')  // non-empty → show credentials modal

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

  const handleInvite = async () => {
    setLoading(true)
    setError('')

    try {
      const tempPassword = 'OS-' + Math.random().toString(36).slice(2, 6).toUpperCase() + '-2025'

      console.log('Step 1: Creating user', email)

      const signupRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/signup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ email, password: tempPassword }),
        }
      )

      const signupData = await signupRes.json()
      console.log('Step 1 result:', signupRes.status, signupData)

      if (!signupData.id) {
        throw new Error('Signup failed: ' + JSON.stringify(signupData))
      }

      console.log('Step 2: Creating profile for', signupData.id)

      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id:           signupData.id,
          user_role:    'recruiter',
          company_name: companyName,
          full_name:    contactName,
          email:        email,
          first_login:  true,
        })

      console.log('Step 2 result:', profileError)

      if (profileError) throw new Error('Profile failed: ' + profileError.message)

      console.log('Step 3: Sending email via Resend')
      console.log('Sending email to:', email, 'from: noreply@oneselect.ai')
      console.log('Using Resend key:', import.meta.env.VITE_RESEND_API_KEY?.slice(0, 10))

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + import.meta.env.VITE_RESEND_API_KEY,
        },
        body: JSON.stringify({
          from:    'One Select <noreply@oneselect.ai>',
          to:      [email],
          subject: 'Your One Select Portal is Ready',
          html:    '<p>Welcome to One Select!</p><p>Your temporary password is: <strong>' + tempPassword + '</strong></p><p>Login at: ' + APP_URL + '</p>',
        }),
      })

      const emailData = await emailRes.json()
      console.log('Step 3 result:', emailRes.status, emailData)

      setSuccess(
        `Account created!\nEmail: ${email}\nTemporary Password: ${tempPassword}\n` +
        (emailRes.ok ? 'Welcome email sent!' : 'Email failed — share password manually')
      )
      setShowInvite(false)
      await loadClients()
    } catch (err) {
      console.error('Invite failed:', err)
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
                <button className="btn btn-primary" disabled={loading} onClick={handleInvite}>
                  {loading
                    ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Creating account…</>
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

      {/* ── Success Modal — stays open until admin clicks Done ── */}
      {success && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-head"><h3>Account Created</h3></div>
            <div className="modal-body">
              <pre style={{
                fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.9,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 'var(--r)', padding: '16px 20px', marginBottom: 20,
                whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text)',
              }}>
                {success}
              </pre>
              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => setSuccess('')}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
