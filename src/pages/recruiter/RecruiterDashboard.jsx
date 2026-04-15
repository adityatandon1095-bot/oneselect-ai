import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'

export default function RecruiterDashboard() {
  const { user, profile, profileLoading } = useAuth()
  const navigate = useNavigate()

  const [stats, setStats]                   = useState({ jobs: 0, candidates: 0, screened: 0, passed: 0, interviewed: 0 })
  const [recentCandidates, setRecentCandidates] = useState([])
  const [recentJobs, setRecentJobs]         = useState([])
  const [loading, setLoading]               = useState(true)
  const [showWelcome, setShowWelcome]       = useState(false)

  // ── Force password change on first login ───────────────────────────────
  const [showPasswordChange, setShowPasswordChange] = useState(false)
  const [newPassword,    setNewPassword]    = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError,  setPasswordError]  = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)

  // Prevent the init logic from running more than once per mount
  const initRef = useRef(false)

  useEffect(() => {
    if (!user || profileLoading) return
    if (initRef.current) return
    initRef.current = true

    // Track activity timestamps — fire-and-forget
    const updates = { last_seen_at: new Date().toISOString() }
    if (!profile?.first_login_at) updates.first_login_at = new Date().toISOString()
    supabase.from('profiles').update(updates).eq('id', user.id)

    if (profile?.first_login && !sessionStorage.getItem(`pw_set_${user.id}`)) {
      // Block dashboard until they set a real password
      setLoading(false)
      setShowPasswordChange(true)
    } else {
      load()
    }
  }, [user, profileLoading])

  async function load() {
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, title, status, created_at')
      .eq('recruiter_id', user.id)
      .order('created_at', { ascending: false })

    const jobIds = (jobs ?? []).map(j => j.id)
    setRecentJobs((jobs ?? []).slice(0, 4))

    if (!jobIds.length) {
      if (!localStorage.getItem(`welcomed_${user.id}`)) setShowWelcome(true)
      setLoading(false)
      return
    }

    const { data: allCandidates } = await supabase
      .from('candidates')
      .select('id, full_name, candidate_role, match_score, match_pass, interview_scores, created_at, job_id')
      .in('job_id', jobIds)
      .order('created_at', { ascending: false })

    const all = allCandidates ?? []
    setStats({
      jobs:        jobs.length,
      candidates:  all.length,
      screened:    all.filter(c => c.match_score != null).length,
      passed:      all.filter(c => c.match_pass === true).length,
      interviewed: all.filter(c => c.interview_scores != null).length,
    })
    setRecentCandidates(all.slice(0, 6))
    setLoading(false)
  }

  // ── Password change handler ────────────────────────────────────────────
  async function handlePasswordChange(e) {
    e.preventDefault()
    setPasswordError('')

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }

    setPasswordSaving(true)
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword })
    if (updateErr) {
      setPasswordError(updateErr.message)
      setPasswordSaving(false)
      return
    }

    await supabase.from('profiles').update({ first_login: false }).eq('id', user.id)

    // Mark in session so the modal doesn't reappear when navigating back to dashboard
    // (AuthContext still holds the stale profile until next full page load)
    sessionStorage.setItem(`pw_set_${user.id}`, '1')

    setNewPassword('')
    setConfirmPassword('')
    setPasswordSaving(false)
    setShowPasswordChange(false)
    load()
  }

  // ── Welcome dismiss ────────────────────────────────────────────────────
  function dismissWelcome(goCreate = false) {
    localStorage.setItem(`welcomed_${user.id}`, '1')
    setShowWelcome(false)
    if (goCreate) navigate('/recruiter/jobs')
  }

  function getStatus(c) {
    if (c.interview_scores) return {
      label: c.interview_scores.recommendation ?? 'Interviewed',
      color: c.interview_scores.recommendation === 'Strong Hire' ? 'var(--green)'  :
             c.interview_scores.recommendation === 'Hire'        ? 'var(--accent)' :
             c.interview_scores.recommendation === 'Reject'      ? 'var(--red)'    : 'var(--amber)',
      bg:    'var(--accent-d)',
    }
    if (c.match_pass === true)  return { label: 'Awaiting Interview', color: 'var(--amber)', bg: 'var(--amber-d)' }
    if (c.match_pass === false) return { label: 'Screened Out',       color: 'var(--red)',   bg: 'var(--red-d)'   }
    if (c.match_score != null)  return { label: 'Screened',           color: 'var(--accent)',bg: 'var(--accent-d)'}
    return { label: 'Pending', color: 'var(--text-3)', bg: 'var(--surface2)' }
  }

  // ── Force password change — full-screen blocking modal ─────────────────
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
              Please set a new password to secure your account before continuing to your dashboard.
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
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
                disabled={passwordSaving}
              >
                {passwordSaving
                  ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Setting password…</>
                  : 'Set Password & Continue'}
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
      {/* ── First-time welcome modal ── */}
      {showWelcome && (
        <div className="modal-overlay">
          <div className="welcome-card">
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--accent)', marginBottom: 20 }}>
              One Select
            </div>
            <h2 style={{ marginBottom: 14 }}>
              Welcome{profile?.company_name ? `, ${profile.company_name}` : ''}!
            </h2>
            <p style={{ color: 'var(--text-2)', lineHeight: 1.8, marginBottom: 28 }}>
              Your AI hiring pipeline is ready. Start by creating your first job —
              then your One Select admin will upload and screen CVs for you.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                className="btn btn-primary"
                style={{ justifyContent: 'center', padding: '12px 24px' }}
                onClick={() => dismissWelcome(true)}
              >
                Create Your First Job
              </button>
              <button
                className="btn btn-secondary"
                style={{ justifyContent: 'center' }}
                onClick={() => dismissWelcome(false)}
              >
                Skip for now
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="page-head">
        <div>
          <h2>Welcome back{profile?.company_name ? `, ${profile.company_name}` : ''}</h2>
          <p>Here's your hiring pipeline at a glance</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/recruiter/jobs')}>+ New Job</button>
      </div>

      {/* Metrics */}
      <div className="metrics-row">
        <div className="metric-card blue" style={{ cursor: 'pointer' }} onClick={() => navigate('/recruiter/jobs')}>
          <span className="metric-val">{stats.jobs}</span>
          <span className="metric-label">Active Jobs</span>
        </div>
        <div className="metric-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/recruiter/candidates')}>
          <span className="metric-val">{stats.candidates}</span>
          <span className="metric-label">CVs Submitted</span>
        </div>
        <div className="metric-card amber" style={{ cursor: 'pointer' }} onClick={() => navigate('/recruiter/candidates?tab=Awaiting+Interview')}>
          <span className="metric-val">{stats.passed}</span>
          <span className="metric-label">Awaiting Interview</span>
        </div>
        <div className="metric-card green" style={{ cursor: 'pointer' }} onClick={() => navigate('/recruiter/reports')}>
          <span className="metric-val">{stats.interviewed}</span>
          <span className="metric-label">Interviews Done</span>
        </div>
      </div>

      {/* Pipeline funnel */}
      {stats.candidates > 0 && (
        <div className="section-card" style={{ marginBottom: 20 }}>
          <div className="section-card-head"><h3>Hiring Funnel</h3></div>
          <div style={{ padding: '20px 24px', display: 'flex', gap: 0, alignItems: 'stretch' }}>
            {[
              { label: 'CVs Submitted',  value: stats.candidates,  color: 'var(--text-3)' },
              { label: 'Screened',       value: stats.screened,    color: 'var(--accent)'  },
              { label: 'Passed Screen',  value: stats.passed,      color: 'var(--amber)'   },
              { label: 'Interviewed',    value: stats.interviewed, color: 'var(--green)'   },
            ].map((step, i, arr) => {
              const pct = arr[0].value > 0 ? Math.round((step.value / arr[0].value) * 100) : 0
              return (
                <div key={step.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                  {i > 0 && (
                    <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 1, height: 40, background: 'var(--border)' }} />
                  )}
                  <div style={{ fontFamily: 'var(--font-head)', fontSize: 32, fontWeight: 300, color: step.color, lineHeight: 1 }}>{step.value}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)', marginTop: 6, textAlign: 'center' }}>{step.label}</div>
                  {i > 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: step.color, marginTop: 4 }}>{pct}%</div>}
                  <div style={{ marginTop: 12, width: '60%', height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: step.color, borderRadius: 2 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Recent candidates */}
        <div className="section-card">
          <div className="section-card-head">
            <h3>Recent Candidates</h3>
            <button className="btn btn-secondary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => navigate('/recruiter/candidates')}>View all</button>
          </div>
          {recentCandidates.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.3 }}>◎</div>
              <div style={{ fontWeight: 400, color: 'var(--text-2)', marginBottom: 6 }}>No candidates yet</div>
              <div style={{ fontSize: 12, marginBottom: 16 }}>Your pipeline is empty. Ask your admin to upload CVs.</div>
            </div>
          ) : (
            recentCandidates.map(c => {
              const st = getStatus(c)
              return (
                <div key={c.id} className="table-row clickable" onClick={() => navigate('/recruiter/candidates')}>
                  <div className="profile-avatar" style={{ width: 32, height: 32, fontSize: 13, borderRadius: 'var(--r)', flexShrink: 0 }}>
                    {(c.full_name ?? '?')[0].toUpperCase()}
                  </div>
                  <div className="col-main">
                    <div className="col-name">{c.full_name}</div>
                    <div className="col-sub">{c.candidate_role}</div>
                  </div>
                  <div className="col-right">
                    {c.interview_scores?.overallScore != null && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: c.interview_scores.overallScore >= 70 ? 'var(--green)' : c.interview_scores.overallScore >= 50 ? 'var(--accent)' : 'var(--red)' }}>
                        {c.interview_scores.overallScore}
                      </span>
                    )}
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: st.color, background: st.bg, padding: '2px 7px', borderRadius: 'var(--r)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                      {st.label}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Active jobs */}
        <div className="section-card">
          <div className="section-card-head">
            <h3>Your Jobs</h3>
            <button className="btn btn-secondary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => navigate('/recruiter/jobs')}>View all</button>
          </div>
          {recentJobs.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.3 }}>◫</div>
              <div style={{ fontWeight: 400, color: 'var(--text-2)', marginBottom: 6 }}>No jobs yet</div>
              <div style={{ fontSize: 12, marginBottom: 16 }}>Create your first job posting to get started.</div>
              <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => navigate('/recruiter/jobs')}>+ Create Job</button>
            </div>
          ) : (
            recentJobs.map(j => (
              <div key={j.id} className="table-row clickable" onClick={() => navigate('/recruiter/jobs')}>
                <div className="col-main">
                  <div className="col-name">{j.title}</div>
                  <div className="col-sub">{new Date(j.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                </div>
                <div className="col-right">
                  <span className={`badge ${j.status === 'active' ? 'badge-green' : 'badge-amber'}`}>{j.status ?? 'active'}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
