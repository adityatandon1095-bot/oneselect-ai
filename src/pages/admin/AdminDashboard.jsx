import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'

export default function AdminDashboard() {
  const { user, profile, profileLoading } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState({ clients: 0, jobs: 0, candidates: 0, interviews: 0, poolTotal: 0, poolAvailable: 0, mrr: 0, placements: 0 })
  const [recentJobs, setRecentJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [sendingUpdates, setSendingUpdates] = useState(false)
  const [updateResult, setUpdateResult] = useState(null)

  // First-login password change
  const [showPasswordChange, setShowPasswordChange] = useState(false)
  const [newPassword,     setNewPassword]     = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError,   setPasswordError]   = useState('')
  const [passwordSaving,  setPasswordSaving]  = useState(false)

  const initRef = useRef(false)

  useEffect(() => {
    if (!user || profileLoading) return
    if (initRef.current) return
    initRef.current = true

    supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', user.id)

    if (profile?.first_login && !sessionStorage.getItem(`pw_set_${user.id}`)) {
      setLoading(false)
      setShowPasswordChange(true)
    } else {
      load()
    }
  }, [user, profileLoading])

  async function load() {
    try {
      const ms = (() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d.toISOString() })()
      const [
        { count: clients },
        { count: jobs },
        { count: candidates },
        { count: interviews },
        { data: recent },
        { count: poolTotal },
        { count: poolAvailable },
        { data: clientProfiles },
        { count: placements },
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('user_role', 'client'),
        supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('candidates').select('*', { count: 'exact', head: true }),
        supabase.from('candidates').select('*', { count: 'exact', head: true }).not('scores', 'is', null),
        supabase.from('jobs').select('id, title, status, created_at, profiles(company_name)').order('created_at', { ascending: false }).limit(8),
        supabase.from('talent_pool').select('*', { count: 'exact', head: true }),
        supabase.from('talent_pool').select('*', { count: 'exact', head: true }).eq('availability', 'available'),
        supabase.from('profiles').select('subscription_status, price_override, plans(price_monthly)').eq('user_role', 'client'),
        supabase.from('candidates').select('*', { count: 'exact', head: true }).eq('final_decision', 'hired').gte('updated_at', ms),
      ])
      const mrr = (clientProfiles ?? []).reduce((sum, c) => {
        if (c.subscription_status !== 'active') return sum
        const price = c.price_override ?? c.plans?.price_monthly ?? 0
        return sum + Number(price)
      }, 0)
      setStats({ clients: clients ?? 0, jobs: jobs ?? 0, candidates: candidates ?? 0, interviews: interviews ?? 0, poolTotal: poolTotal ?? 0, poolAvailable: poolAvailable ?? 0, mrr, placements: placements ?? 0 })
      setRecentJobs(recent ?? [])
    } finally {
      setLoading(false)
    }
  }

  async function handlePasswordChange(e) {
    e.preventDefault()
    setPasswordError('')
    if (newPassword.length < 8) { setPasswordError('Password must be at least 8 characters'); return }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match'); return }

    setPasswordSaving(true)
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword })
    if (updateErr) { setPasswordError(updateErr.message); setPasswordSaving(false); return }

    await supabase.from('profiles').update({ first_login: false }).eq('id', user.id)
    sessionStorage.setItem(`pw_set_${user.id}`, '1')

    setNewPassword('')
    setConfirmPassword('')
    setPasswordSaving(false)
    setShowPasswordChange(false)
    load()
  }

  async function sendWeeklyUpdates() {
    setSendingUpdates(true)
    setUpdateResult(null)
    try {
      const { error } = await supabase.functions.invoke('weekly-client-update', { body: {} })
      setUpdateResult(error ? { ok: false, msg: error.message } : { ok: true, msg: 'Weekly updates sent to all active clients.' })
    } catch (e) {
      setUpdateResult({ ok: false, msg: e.message })
    }
    setSendingUpdates(false)
  }

  // First-login password change screen — no dismissal allowed
  if (showPasswordChange) {
    return (
      <div className="modal-overlay" style={{ zIndex: 1000 }}>
        <div className="modal" style={{ maxWidth: 420 }}>
          <div className="modal-head">
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--accent)', marginBottom: 4 }}>
                One Select
              </div>
              <h3 style={{ margin: 0 }}>Welcome to One Select</h3>
            </div>
          </div>
          <div className="modal-body">
            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 24 }}>
              Please set a new password to secure your admin account before continuing.
            </p>
            {passwordError && <div className="error-banner" style={{ marginBottom: 16 }}>{passwordError}</div>}
            <form onSubmit={handlePasswordChange}>
              <div className="field" style={{ marginBottom: 14 }}>
                <label>New Password</label>
                <input
                  type="password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  autoFocus
                  autoComplete="new-password"
                />
              </div>
              <div className="field" style={{ marginBottom: 24 }}>
                <label>Confirm Password</label>
                <input
                  type="password"
                  placeholder="Repeat your new password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={passwordSaving}>
                {passwordSaving ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Saving…</> : 'Set Password & Continue'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  if (loading) return <div className="page"><span className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Dashboard</h2>
          <p>Platform-wide overview</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <button className="btn btn-secondary" disabled={sendingUpdates} onClick={sendWeeklyUpdates}>
            {sendingUpdates ? <><span className="spinner" style={{ width: 11, height: 11 }} /> Sending…</> : '✉ Send Weekly Updates'}
          </button>
          {updateResult && (
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: updateResult.ok ? 'var(--green)' : 'var(--red)' }}>
              {updateResult.msg}
            </span>
          )}
        </div>
      </div>

      <div className="metrics-row">
        <div className="metric-card blue" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/clients')}>
          <span className="metric-val">{stats.clients}</span>
          <span className="metric-label">Total Clients</span>
        </div>
        <div className="metric-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/jobs')}>
          <span className="metric-val">{stats.jobs}</span>
          <span className="metric-label">Active Jobs</span>
        </div>
        <div className="metric-card amber" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/pipeline')}>
          <span className="metric-val">{stats.candidates}</span>
          <span className="metric-label">Candidates Processed</span>
        </div>
        <div className="metric-card green" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/analytics')}>
          <span className="metric-val">{stats.interviews}</span>
          <span className="metric-label">Interviews Done</span>
        </div>
      </div>

      <div className="metrics-row" style={{ marginBottom: 20 }}>
        <div className="metric-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/talent-pool')}>
          <span className="metric-val">{stats.poolTotal}</span>
          <span className="metric-label">Pool · Total</span>
        </div>
        <div className="metric-card green" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/talent-pool')}>
          <span className="metric-val">{stats.poolAvailable}</span>
          <span className="metric-label">Pool · Available</span>
        </div>
        <div className="metric-card green" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/billing')}>
          <span className="metric-val">₹{stats.mrr.toLocaleString()}</span>
          <span className="metric-label">MRR</span>
        </div>
        <div className="metric-card amber" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/pipeline')}>
          <span className="metric-val">{stats.placements}</span>
          <span className="metric-label">Placements This Month</span>
        </div>
      </div>

      <div className="section-card">
        <div className="section-card-head"><h3>Recent Jobs</h3></div>
        {recentJobs.length === 0
          ? (
            <div className="empty-state">
              <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.3 }}>◫</div>
              <div style={{ fontWeight: 400, color: 'var(--text-2)', marginBottom: 6 }}>No jobs yet</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Newly created jobs across the platform will appear here.</div>
            </div>
          )
          : recentJobs.map((j) => (
            <div key={j.id} className="table-row">
              <div className="col-main">
                <div className="col-name">{j.title}</div>
                <div className="col-sub">{j.profiles?.company_name ?? '—'}</div>
              </div>
              <div className="col-right">
                <span className={`badge ${j.status === 'active' ? 'badge-green' : 'badge-amber'}`}>
                  {j.status ?? 'active'}
                </span>
                <span className="mono text-muted" style={{ fontSize: 11 }}>
                  {new Date(j.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )
}
