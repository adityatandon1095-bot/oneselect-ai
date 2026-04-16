import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const PAGE_SIZE = 20

function reqLabel(st) {
  if (st === 'active')   return { label: 'Active',   cls: 'badge-green' }
  if (st === 'pending')  return { label: 'Pending',  cls: 'badge-amber' }
  return                        { label: 'Inactive', cls: '' }
}

export default function AdminClients() {
  const navigate = useNavigate()

  // ── Data ────────────────────────────────────────────────────────────────────
  const [profiles, setProfiles] = useState([])
  const [jobMap,   setJobMap]   = useState({})  // recruiter_id → Job[]
  const [candMap,  setCandMap]  = useState({})  // job_id → count
  const [loading,  setLoading]  = useState(true)

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy,       setSortBy]       = useState('newest')
  const [page,         setPage]         = useState(1)

  // ── Invite ───────────────────────────────────────────────────────────────────
  const [showInvite, setShowInvite] = useState(false)
  const [invEmail,   setInvEmail]   = useState('')
  const [invCompany, setInvCompany] = useState('')
  const [invContact, setInvContact] = useState('')
  const [inviting,   setInviting]   = useState(false)
  const [invError,   setInvError]   = useState('')
  const [invResult,  setInvResult]  = useState(null)

  useEffect(() => { load() }, [])
  useEffect(() => { setPage(1) }, [search, statusFilter, sortBy])

  async function load() {
    const [
      { data: profileData },
      { data: jobData },
      { data: candData },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_role', 'client').order('created_at', { ascending: false }),
      supabase.from('jobs').select('id, recruiter_id, status, created_at'),
      supabase.from('candidates').select('job_id'),
    ])

    const jm = {}
    ;(jobData ?? []).forEach(j => {
      if (!jm[j.recruiter_id]) jm[j.recruiter_id] = []
      jm[j.recruiter_id].push(j)
    })
    const cm = {}
    ;(candData ?? []).forEach(c => { cm[c.job_id] = (cm[c.job_id] ?? 0) + 1 })

    setProfiles(profileData ?? [])
    setJobMap(jm)
    setCandMap(cm)
    setLoading(false)
  }

  // ── Per-client helpers ───────────────────────────────────────────────────────
  function clientStats(p) {
    const jobs   = jobMap[p.id] ?? []
    const active = jobs.filter(j => j.status === 'active')
    const cands  = jobs.reduce((s, j) => s + (candMap[j.id] ?? 0), 0)
    return { jobs, active, cands }
  }

  function clientStatus(p) {
    const { jobs, active } = clientStats(p)
    if (active.length > 0) return 'active'
    if (jobs.length === 0)  return 'pending'
    return 'inactive'
  }

  // ── Global stats ─────────────────────────────────────────────────────────────
  const totalClients   = profiles.length
  const activeClients  = profiles.filter(p => clientStatus(p) === 'active').length
  const totalOpenRoles = Object.values(jobMap).flat().filter(j => j.status === 'active').length
  const totalCands     = Object.values(candMap).reduce((s, n) => s + n, 0)

  // ── Filter + sort ─────────────────────────────────────────────────────────────
  const filtered = profiles
    .filter(p => {
      const q        = search.toLowerCase()
      const okSearch = !q || p.company_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q)
      const okStatus = statusFilter === 'all' || clientStatus(p) === statusFilter
      return okSearch && okStatus
    })
    .sort((a, b) => {
      if (sortBy === 'company') return (a.company_name ?? '').localeCompare(b.company_name ?? '')
      if (sortBy === 'jobs')    return (jobMap[b.id]?.length ?? 0) - (jobMap[a.id]?.length ?? 0)
      return 0 // newest — DB already orders desc
    })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // ── Invite handlers ──────────────────────────────────────────────────────────
  function openInvite() {
    setInvEmail(''); setInvCompany(''); setInvContact(''); setInvError('')
    setShowInvite(true)
  }

  async function handleInvite() {
    if (!invCompany.trim() || !invEmail.trim()) { setInvError('Please fill in all fields'); return }
    setInviting(true); setInvError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({
          email:        invEmail.trim().toLowerCase(),
          company_name: invCompany.trim(),
          contact_name: invContact.trim(),
        }),
      })
      const result = await res.json()
      console.log('Edge function response:', res.status, result)
      if (!res.ok) throw new Error(result.error || 'Invite failed')
      setInvResult({ email: invEmail.trim().toLowerCase(), password: result.tempPassword, emailSent: result.emailSent })
      setShowInvite(false)
      await load()
    } catch (err) {
      setInvError(err.message)
    } finally {
      setInviting(false)
    }
  }

  function copyDetails() {
    if (!invResult) return
    navigator.clipboard.writeText(
      `Portal: https://oneselect-ai-t6uo-phi.vercel.app\nEmail: ${invResult.email}\nPassword: ${invResult.password}`
    ).catch(() => {})
  }

  async function handleRemove(c) {
    const label = c.company_name || c.email
    if (!window.confirm(`Remove ${label}?\n\nThis removes them from your clients list. Their jobs and candidates are retained.`)) return
    const { error } = await supabase.from('profiles').delete().eq('id', c.id)
    if (!error) setProfiles(p => p.filter(x => x.id !== c.id))
  }

  if (loading) return <div className="page"><span className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Clients</h2>
          <p>{totalClients} recruiter account{totalClients !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={openInvite}>+ Invite Client</button>
      </div>

      {/* ── Stats bar ── */}
      <div className="metrics-row" style={{ marginBottom: 24 }}>
        <div className="metric-card blue">
          <span className="metric-val">{totalClients}</span>
          <span className="metric-label">Total Clients</span>
        </div>
        <div className="metric-card green">
          <span className="metric-val">{activeClients}</span>
          <span className="metric-label">Active Clients</span>
        </div>
        <div className="metric-card">
          <span className="metric-val">{totalOpenRoles}</span>
          <span className="metric-label">Open Roles</span>
        </div>
        <div className="metric-card amber">
          <span className="metric-val">{totalCands}</span>
          <span className="metric-label">Candidates Processed</span>
        </div>
      </div>

      {/* ── Search + filters ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search company or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: '1 1 220px', minWidth: 0 }}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {[['all', 'All'], ['active', 'Active'], ['pending', 'Pending']].map(([val, lbl]) => (
            <button
              key={val}
              className={`btn ${statusFilter === val ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 12px', fontSize: 12 }}
              onClick={() => setStatusFilter(val)}
            >{lbl}</button>
          ))}
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ fontSize: 12, padding: '6px 10px' }}>
          <option value="newest">Newest first</option>
          <option value="company">Company name</option>
          <option value="jobs">Most jobs</option>
        </select>
      </div>

      {/* ── Client table ── */}
      <div className="section-card">
        <div className="section-card-head">
          <h3>All Clients</h3>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ''}
          </span>
        </div>

        {pageItems.length === 0 ? (
          <div className="empty-state">
            {profiles.length === 0
              ? <><div style={{ fontSize: 28, marginBottom: 10, opacity: 0.3 }}>◉</div>No clients yet. Invite your first client.</>
              : 'No clients match this filter.'}
          </div>
        ) : (
          <>
            <div className="client-table-head">
              <span>Company</span>
              <span>Email</span>
              <span style={{ textAlign: 'right' }}>Active Jobs</span>
              <span style={{ textAlign: 'right' }}>Candidates</span>
              <span>Status</span>
              <span>Last Active</span>
              <span>Actions</span>
            </div>

            {pageItems.map(c => {
              const { active, jobs, cands } = clientStats(c)
              const st   = clientStatus(c)
              const scfg = reqLabel(st)
              const lastActive = c.last_seen_at ?? c.first_login_at ?? c.created_at
              return (
                <div key={c.id} className="client-table-row">
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text)' }}>{c.company_name ?? '—'}</div>
                    {c.full_name && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{c.full_name}</div>}
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                    {c.email}
                  </div>

                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: active.length > 0 ? 'var(--green)' : 'var(--text-3)' }}>
                    {active.length}
                    {jobs.length > active.length && (
                      <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 4 }}>/ {jobs.length}</span>
                    )}
                  </div>

                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: cands > 0 ? 'var(--text)' : 'var(--text-3)' }}>
                    {cands}
                  </div>

                  <div>
                    <span
                      className={`badge ${scfg.cls}`}
                      style={{ fontSize: 10, ...(st === 'inactive' ? { color: 'var(--text-3)', background: 'var(--surface2)', borderColor: 'var(--border)' } : {}) }}
                    >{scfg.label}</span>
                  </div>

                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
                    {new Date(lastActive).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </div>

                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 10, padding: '3px 8px' }}
                      onClick={() => navigate('/admin/jobs', { state: { clientId: c.id, clientName: c.company_name || c.email } })}
                    >View Jobs</button>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 10, padding: '3px 8px', color: 'var(--accent)' }}
                      onClick={() => navigate(`/admin/pipeline?client=${c.id}`)}
                    >Pipeline</button>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 10, padding: '3px 8px', color: 'var(--red)' }}
                      onClick={() => handleRemove(c)}
                    >Remove</button>
                  </div>
                </div>
              )
            })}
          </>
        )}

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '16px 0', borderTop: '1px solid var(--border)', marginTop: 8 }}>
            <button
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '5px 14px' }}
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >← Previous</button>
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
              Page {page} of {totalPages}
            </span>
            <button
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '5px 14px' }}
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >Next →</button>
          </div>
        )}
      </div>

      {/* ── Invite Modal ── */}
      {showInvite && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowInvite(false) }}>
          <div className="modal">
            <div className="modal-head">
              <h3>Invite New Client</h3>
              <button className="modal-close" onClick={() => setShowInvite(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field">
                  <label>Company Name *</label>
                  <input type="text" placeholder="Acme Recruiting" value={invCompany} onChange={e => setInvCompany(e.target.value)} autoFocus />
                </div>
                <div className="field">
                  <label>Contact Name</label>
                  <input type="text" placeholder="Jane Smith" value={invContact} onChange={e => setInvContact(e.target.value)} />
                </div>
                <div className="field span-2">
                  <label>Email Address *</label>
                  <input
                    type="email" placeholder="jane@acmecorp.com"
                    value={invEmail} onChange={e => setInvEmail(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleInvite() } }}
                  />
                </div>
              </div>
              {invError && <div className="error-banner" style={{ marginTop: 14 }}>{invError}</div>}
              <div className="form-actions" style={{ marginTop: 20 }}>
                <button className="btn btn-primary" disabled={inviting} onClick={handleInvite}>
                  {inviting ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Sending…</> : 'Send Invitation'}
                </button>
                <button className="btn btn-secondary" onClick={() => setShowInvite(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Result Modal ── */}
      {invResult && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-head">
              <h3 style={{ color: 'var(--green)' }}>Client Invited Successfully!</h3>
            </div>
            <div className="modal-body">
              <div style={{
                padding: '10px 14px', marginBottom: 20, fontSize: 13,
                background: invResult.emailSent ? 'var(--green-d)' : 'var(--amber-d)',
                borderLeft: `2px solid ${invResult.emailSent ? 'var(--green)' : 'var(--amber)'}`,
                color: invResult.emailSent ? 'var(--green)' : 'var(--amber)',
              }}>
                {invResult.emailSent
                  ? `✓ Welcome email sent to ${invResult.email}`
                  : '⚠ Email failed — copy and share manually'}
              </div>
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 20px', marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-3)', marginBottom: 14 }}>
                  Login Details
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', width: 72, flexShrink: 0 }}>Portal</span>
                    <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>oneselect-ai-t6uo-phi.vercel.app</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', width: 72, flexShrink: 0 }}>Email</span>
                    <span style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{invResult.email}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', width: 72, flexShrink: 0 }}>Password</span>
                    <span style={{ fontSize: 24, color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.15em' }}>
                      {invResult.password}
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={copyDetails}>
                  Copy Login Details
                </button>
                <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setInvResult(null)}>
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
