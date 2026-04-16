import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import JDWizard from '../../components/JDWizard'

// ── Requirements-met logic ────────────────────────────────────────────────────
// met      = 1+ candidate with match_pass=true AND Strong Hire/Hire recommendation
// progress = 1+ passed screening, pending interview
// attention= candidates exist but none qualified
// awaiting = no candidates at all
function reqStatus(cands) {
  if (!cands.length) return 'awaiting'
  const hasStrong = cands.some(c =>
    c.match_pass && ['Strong Hire', 'Hire'].includes(c.interview_scores?.recommendation)
  )
  if (hasStrong) return 'met'
  const pendingInterview = cands.some(c => c.match_pass && !c.interview_scores)
  if (pendingInterview) return 'progress'
  return 'attention'
}

const REQ_CFG = {
  met:       { label: 'Requirements Met', cls: 'badge-green' },
  progress:  { label: 'In Progress',      cls: 'badge-blue'  },
  attention: { label: 'Needs Attention',  cls: 'badge-red'   },
  awaiting:  { label: 'Awaiting CVs',     cls: 'badge-amber' },
}

const COL = '2fr 1.5fr 90px 140px 170px 60px 90px 120px'

export default function AdminJobs() {
  const location   = useLocation()
  const navigate   = useNavigate()
  const clientId   = location.state?.clientId   ?? null
  const clientName = location.state?.clientName ?? null

  const [jobs,       setJobs]       = useState([])
  const [candMap,    setCandMap]    = useState({})  // job_id → Candidate[]
  const [loading,    setLoading]    = useState(true)
  const [filter,     setFilter]     = useState('all')
  const [closing,    setClosing]    = useState(null)
  const [showWizard, setShowWizard] = useState(false)
  const [recruiters, setRecruiters] = useState([])

  useEffect(() => { load(); loadRecruiters() }, [])

  async function loadRecruiters() {
    const { data } = await supabase
      .from('profiles')
      .select('id, email, contact_name, company_name')
      .eq('user_role', 'recruiter')
      .order('contact_name', { ascending: true })
    setRecruiters(data ?? [])
  }

  async function handleWizardSave(jobData) {
    setShowWizard(false)
    const { assigned_to, work_mode, ...rest } = jobData
    const recruiterId = assigned_to ?? null
    if (!recruiterId) return   // require assignment in admin flow
    await supabase.from('jobs').insert({
      recruiter_id: recruiterId,
      status: 'active',
      work_mode,
      ...rest,
    })
    load()
  }

  async function load() {
    let q = supabase
      .from('jobs')
      .select('*, profiles(company_name, email)')
      .order('created_at', { ascending: false })
    if (clientId) q = q.eq('recruiter_id', clientId)

    const { data: jobData } = await q
    const ids = (jobData ?? []).map(j => j.id)

    let candData = []
    if (ids.length) {
      const { data } = await supabase
        .from('candidates')
        .select('job_id, match_pass, match_score, interview_scores')
        .in('job_id', ids)
      candData = data ?? []
    }

    const cm = {}
    candData.forEach(c => {
      if (!cm[c.job_id]) cm[c.job_id] = []
      cm[c.job_id].push(c)
    })

    setJobs(jobData ?? [])
    setCandMap(cm)
    setLoading(false)
  }

  async function toggleStatus(job) {
    setClosing(job.id)
    const next = job.status === 'active' ? 'closed' : 'active'
    await supabase.from('jobs').update({ status: next }).eq('id', job.id)
    setJobs(p => p.map(j => j.id === job.id ? { ...j, status: next } : j))
    setClosing(null)
  }

  const filtered = filter === 'all' ? jobs : jobs.filter(j => j.status === filter)

  // ── Stats (only meaningful for all-client view) ───────────────────────────
  const activeJobs    = jobs.filter(j => j.status === 'active')
  const withStrong    = activeJobs.filter(j => reqStatus(candMap[j.id] ?? []) === 'met').length
  const needAttention = activeJobs.filter(j => {
    const st = reqStatus(candMap[j.id] ?? [])
    return st === 'attention' || st === 'awaiting'
  }).length
  const avgDays = activeJobs.length
    ? Math.round(
        activeJobs.reduce((s, j) => s + (Date.now() - new Date(j.created_at)) / 86_400_000, 0)
        / activeJobs.length
      )
    : 0

  if (loading) return <div className="page"><span className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-head">
        <div>
          {clientName && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 11, padding: '3px 8px' }}
                onClick={() => navigate('/admin/clients')}
              >← Clients</button>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{clientName}</span>
            </div>
          )}
          <h2>{clientName ? 'Jobs' : 'All Jobs'}</h2>
          <p>
            {jobs.length} job{jobs.length !== 1 ? 's' : ''}
            {clientName ? ' for this client' : ' across all clients'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {['all', 'active', 'closed'].map(s => (
            <button
              key={s}
              className={`btn ${filter === s ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 12px', fontSize: 12, textTransform: 'capitalize' }}
              onClick={() => setFilter(s)}
            >{s}</button>
          ))}
          <button
            className="btn btn-primary"
            style={{ marginLeft: 6 }}
            onClick={() => setShowWizard(true)}
          >✨ Create with AI</button>
        </div>
      </div>

      {/* ── Stats bar (all-client view only) ── */}
      {!clientId && (
        <div className="metrics-row" style={{ marginBottom: 24 }}>
          <div className="metric-card">
            <span className="metric-val">{activeJobs.length}</span>
            <span className="metric-label">Active Jobs</span>
          </div>
          <div className="metric-card green">
            <span className="metric-val">{withStrong}</span>
            <span className="metric-label">Requirements Met</span>
          </div>
          <div className="metric-card amber">
            <span className="metric-val">{needAttention}</span>
            <span className="metric-label">Needs Attention</span>
          </div>
          <div className="metric-card">
            <span className="metric-val">{avgDays}d</span>
            <span className="metric-label">Avg Days Open</span>
          </div>
        </div>
      )}

      {/* ── Jobs table ── */}
      <div className="section-card">
        <div className="section-card-head">
          <h3>{clientName ? `${clientName} · Jobs` : 'All Jobs'}</h3>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{filtered.length} shown</span>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            {jobs.length === 0 ? 'No jobs created yet.' : 'No jobs match this filter.'}
          </div>
        ) : (
          <>
            {/* Table header */}
            <div style={{
              display: 'grid', gridTemplateColumns: COL, gap: '0 10px',
              padding: '8px 20px', borderBottom: '1px solid var(--border)',
              fontSize: 10, fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)',
            }}>
              <span>Job</span>
              <span>{clientId ? 'Created' : 'Client'}</span>
              <span>Status</span>
              <span>Req. Met</span>
              <span>Candidates</span>
              <span style={{ textAlign: 'right' }}>Top</span>
              <span style={{ textAlign: 'right' }}>Date</span>
              <span>Actions</span>
            </div>

            {filtered.map(j => {
              const cands      = candMap[j.id] ?? []
              const rq         = reqStatus(cands)
              const rqCfg      = REQ_CFG[rq]
              const screened   = cands.filter(c => c.match_score != null).length
              const interviewed = cands.filter(c => c.interview_scores != null).length
              const qualified  = cands.filter(c => c.match_pass).length
              const topScore   = cands.reduce((mx, c) => Math.max(mx, c.match_score ?? 0), 0)

              return (
                <div key={j.id} style={{
                  display: 'grid', gridTemplateColumns: COL, gap: '0 10px',
                  padding: '13px 20px', borderBottom: '1px solid var(--border2)',
                  alignItems: 'center',
                }}>
                  {/* Job title */}
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text)' }}>{j.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                      {j.experience_years ?? 0}+ yrs
                      {(j.required_skills ?? []).length > 0 &&
                        ` · ${(j.required_skills ?? []).slice(0, 2).join(', ')}${(j.required_skills ?? []).length > 2 ? '…' : ''}`}
                    </div>
                  </div>

                  {/* Client / date */}
                  <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    {clientId
                      ? new Date(j.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                      : (j.profiles?.company_name ?? j.profiles?.email ?? '—')}
                  </div>

                  {/* Status */}
                  <div>
                    <span className={`badge ${j.status === 'active' ? 'badge-green' : j.status === 'closed' ? 'badge-red' : 'badge-amber'}`} style={{ fontSize: 9 }}>
                      {j.status ?? 'active'}
                    </span>
                  </div>

                  {/* Requirements met */}
                  <div>
                    <span className={`badge ${rqCfg.cls}`} style={{ fontSize: 9, whiteSpace: 'nowrap' }}>
                      {rqCfg.label}
                    </span>
                  </div>

                  {/* Candidate counts */}
                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                    <span style={{ color: screened    > 0 ? 'var(--text)'   : undefined }}>{screened}</span> screened ·{' '}
                    <span style={{ color: interviewed > 0 ? 'var(--accent)' : undefined }}>{interviewed}</span> iv ·{' '}
                    <span style={{ color: qualified   > 0 ? 'var(--green)'  : undefined }}>{qualified}</span> pass
                  </div>

                  {/* Top score */}
                  <div style={{
                    textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13,
                    color: topScore >= 70 ? 'var(--green)' : topScore >= 50 ? 'var(--accent)' : 'var(--text-3)',
                  }}>
                    {topScore > 0 ? topScore : '—'}
                  </div>

                  {/* Date */}
                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', textAlign: 'right' }}>
                    {new Date(j.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 10, padding: '3px 7px', whiteSpace: 'nowrap' }}
                      onClick={() => navigate(`/admin/pipeline?client=${j.recruiter_id}`)}
                    >Pipeline</button>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 10, padding: '3px 7px', whiteSpace: 'nowrap', color: j.status === 'active' ? 'var(--red)' : 'var(--green)' }}
                      disabled={closing === j.id}
                      onClick={() => toggleStatus(j)}
                    >{closing === j.id ? '…' : j.status === 'active' ? 'Close' : 'Reopen'}</button>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {showWizard && (
        <JDWizard
          onClose={() => setShowWizard(false)}
          onSave={handleWizardSave}
          showAssign
          recruiters={recruiters}
        />
      )}
    </div>
  )
}
