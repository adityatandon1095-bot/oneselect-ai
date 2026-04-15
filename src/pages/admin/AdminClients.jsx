import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const APP_URL = 'https://oneselect-ai-t6uo-phi.vercel.app'

export default function AdminClients() {
  const navigate = useNavigate()

  // ── Page state ────────────────────────────────────────────────────────────
  const [clients, setClients]     = useState([])
  const [pageLoading, setPageLoading] = useState(true)
  const [actionMsg, setActionMsg] = useState({ text: '', ok: true })

  // ── Invite form state ─────────────────────────────────────────────────────
  const [showInvite, setShowInvite] = useState(false)
  const [email, setEmail]           = useState('')
  const [companyName, setCompanyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  // ── Credentials modal state ───────────────────────────────────────────────
  const [tempCredentials, setTempCredentials] = useState(null)
  const [showCredentials, setShowCredentials] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => { loadClients() }, [])

  // ── Data loading ──────────────────────────────────────────────────────────
  async function loadClients() {
    setPageLoading(true)

    const { data: profiles, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_role', 'recruiter')
      .order('created_at', { ascending: false })

    if (profileErr) {
      setClients([])
      setPageLoading(false)
      return
    }

    if (!profiles?.length) {
      setClients([])
      setPageLoading(false)
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
    setPageLoading(false)
  }

  // ── Invite ────────────────────────────────────────────────────────────────
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
    if (!companyName || !email) {
      setError('Company name and email are required')
      return
    }

    setLoading(true)
    setError('')

    try {
      const tempPassword = 'OS' + Math.random().toString(36).slice(2, 8).toUpperCase() + '2025!'

      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: tempPassword,
      })

      if (signUpError) {
        setError(signUpError.message)
        return
      }

      if (!authData?.user?.id) {
        setError('User creation failed - no user returned')
        return
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id:           authData.user.id,
          user_role:    'recruiter',
          company_name: companyName.trim(),
          full_name:    contactName.trim(),
          email:        email.trim().toLowerCase(),
        })

      if (profileError) {
        setError('Account created but profile failed: ' + profileError.message)
        return
      }

      // Store credentials and show credentials modal
      setTempCredentials({
        email:    email.trim().toLowerCase(),
        password: tempPassword,
        company:  companyName.trim(),
      })
      setCopied(false)
      setShowInvite(false)
      setShowCredentials(true)
      await loadClients()
    } catch (err) {
      console.error('Invite error:', err)
      setError('Unexpected error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  function copyCredentials() {
    if (!tempCredentials) return
    const text =
      `OneSelect Login Details\n` +
      `URL: ${APP_URL}\n` +
      `Email: ${tempCredentials.email}\n` +
      `Temporary Password: ${tempCredentials.password}\n\n` +
      `Please log in and change your password after first sign-in.`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  function closeCredentials() {
    setShowCredentials(false)
    setTempCredentials(null)
    setCopied(false)
  }

  // ── Remove ────────────────────────────────────────────────────────────────
  async function handleRemove(client) {
    const label = client.company_name || client.email
    if (!window.confirm(
      `Remove ${label}?\n\nThis removes them from your clients list. ` +
      `Their jobs and candidates are retained.\n\n` +
      `Note: delete their auth account from the Supabase dashboard if needed.`
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

  // ── Render ────────────────────────────────────────────────────────────────
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
          background: actionMsg.ok ? 'var(--green-d)' : 'var(--red-d)',
          borderLeft: `2px solid ${actionMsg.ok ? 'var(--green)' : 'var(--red)'}`,
          fontSize: 13, color: actionMsg.ok ? 'var(--green)' : 'var(--red)',
        }}>
          {actionMsg.text}
        </div>
      )}

      {/* ── Client table ── */}
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

              {error && (
                <div className="error-banner" style={{ marginTop: 14 }}>{error}</div>
              )}

              <div className="form-actions" style={{ marginTop: 20 }}>
                <button
                  className="btn btn-primary"
                  disabled={loading}
                  onClick={handleInvite}
                >
                  {loading
                    ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Creating account…</>
                    : 'Create Account'}
                </button>
                <button className="btn btn-secondary" onClick={closeInvite}>
                  Cancel
                </button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 16, lineHeight: 1.7 }}>
                A temporary password will be generated. You'll see it on the next screen to share with your client.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Credentials Modal (no backdrop close — password must be copied) ── */}
      {showCredentials && tempCredentials && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-head">
              <h3>Account Created</h3>
              {/* No close button — force user to click Done after copying */}
            </div>
            <div className="modal-body">
              {/* Success badge */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
                padding: '10px 14px', background: 'var(--green-d)',
                border: '1px solid var(--green)', borderRadius: 'var(--r)',
              }}>
                <span style={{ color: 'var(--green)', fontSize: 16 }}>✓</span>
                <span style={{ fontSize: 13, color: 'var(--green)', fontWeight: 500 }}>
                  Account created successfully!
                </span>
              </div>

              <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
                Share these login details with <strong>{tempCredentials.company}</strong>:
              </p>

              {/* Credentials box */}
              <div style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 'var(--r)', padding: '16px 18px', marginBottom: 8,
                fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 2.2,
              }}>
                <div>
                  <span style={{ color: 'var(--text-3)', minWidth: 90, display: 'inline-block' }}>Company</span>
                  <span style={{ color: 'var(--text)' }}>{tempCredentials.company}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-3)', minWidth: 90, display: 'inline-block' }}>Login URL</span>
                  <span style={{ color: 'var(--text)' }}>{APP_URL}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-3)', minWidth: 90, display: 'inline-block' }}>Email</span>
                  <span style={{ color: 'var(--text)' }}>{tempCredentials.email}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-3)', minWidth: 90, display: 'inline-block' }}>Password</span>
                  <span style={{ color: 'var(--amber)', fontWeight: 700, fontSize: 14, letterSpacing: '0.04em' }}>
                    {tempCredentials.password}
                  </span>
                </div>
              </div>

              {/* Warning */}
              <div style={{
                padding: '9px 12px', marginBottom: 20,
                background: 'var(--amber-d)', border: '1px solid var(--amber)',
                borderRadius: 'var(--r)', fontSize: 11, color: 'var(--amber)', lineHeight: 1.6,
              }}>
                ⚠ Share these credentials with your client now. The password will not be shown again.
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={copyCredentials}
                >
                  {copied ? '✓ Copied!' : 'Copy Login Details'}
                </button>
                <button className="btn btn-secondary" onClick={closeCredentials}>
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
