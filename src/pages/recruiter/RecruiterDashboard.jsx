import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'

export default function RecruiterDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [clients, setClients] = useState([])
  const [stats, setStats] = useState({ clients: 0, jobs: 0, candidates: 0, interviewed: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (user) load() }, [user])

  async function load() {
    // Load clients assigned to this recruiter
    const { data: rcData } = await supabase
      .from('recruiter_clients')
      .select('client_id, profiles!recruiter_clients_client_id_fkey(id, company_name, email, full_name, created_at)')
      .eq('recruiter_id', user.id)

    const assignedClients = (rcData ?? []).map(r => r.profiles).filter(Boolean)
    const clientIds = assignedClients.map(c => c.id)

    if (!clientIds.length) {
      setClients([])
      setStats({ clients: 0, jobs: 0, candidates: 0, interviewed: 0 })
      setLoading(false)
      return
    }

    // Load jobs for all assigned clients
    const { data: jobsData } = await supabase
      .from('jobs')
      .select('id, title, status, recruiter_id, candidates(count)')
      .in('recruiter_id', clientIds)

    const allJobs = jobsData ?? []
    const jobIds = allJobs.map(j => j.id)

    // Load candidate stats
    let interviewed = 0
    if (jobIds.length) {
      const { data: cData } = await supabase
        .from('candidates')
        .select('id, interview_scores')
        .in('job_id', jobIds)
        .not('interview_scores', 'is', null)
      interviewed = (cData ?? []).length
    }

    const totalCandidates = allJobs.reduce((sum, j) => sum + (j.candidates?.[0]?.count ?? 0), 0)

    // Attach job counts per client
    const enriched = assignedClients.map(c => ({
      ...c,
      jobs: allJobs.filter(j => j.recruiter_id === c.id),
    }))

    setClients(enriched)
    setStats({
      clients: assignedClients.length,
      jobs: allJobs.length,
      candidates: totalCandidates,
      interviewed,
    })
    setLoading(false)
  }

  if (loading) return <div className="page"><span className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Recruiter Dashboard</h2>
          <p>Your assigned clients and their hiring pipelines</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/recruiter/pipeline')}>
          Open Pipeline
        </button>
      </div>

      <div className="metrics-row">
        <div className="metric-card blue">
          <span className="metric-val">{stats.clients}</span>
          <span className="metric-label">Assigned Clients</span>
        </div>
        <div className="metric-card">
          <span className="metric-val">{stats.jobs}</span>
          <span className="metric-label">Active Jobs</span>
        </div>
        <div className="metric-card amber">
          <span className="metric-val">{stats.candidates}</span>
          <span className="metric-label">CVs Submitted</span>
        </div>
        <div className="metric-card green">
          <span className="metric-val">{stats.interviewed}</span>
          <span className="metric-label">Interviews Done</span>
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="section-card">
          <div className="empty-state">
            <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.3 }}>◉</div>
            <div style={{ fontWeight: 400, color: 'var(--text-2)', marginBottom: 6 }}>No clients assigned yet</div>
            <div style={{ fontSize: 12 }}>Your admin will assign clients to you.</div>
          </div>
        </div>
      ) : (
        <div className="section-card">
          <div className="section-card-head"><h3>Your Clients</h3></div>
          {clients.map(c => {
            const activeJobs = c.jobs.filter(j => j.status === 'active').length
            const totalCandidates = c.jobs.reduce((sum, j) => sum + (j.candidates?.[0]?.count ?? 0), 0)
            return (
              <div
                key={c.id}
                className="table-row clickable"
                onClick={() => navigate(`/recruiter/pipeline?client=${c.id}`)}
              >
                <div className="profile-avatar" style={{ width: 36, height: 36, fontSize: 15, borderRadius: 'var(--r)', flexShrink: 0 }}>
                  {(c.company_name ?? c.full_name ?? '?')[0].toUpperCase()}
                </div>
                <div className="col-main">
                  <div className="col-name">{c.company_name || c.full_name || c.email}</div>
                  <div className="col-sub">{c.email}</div>
                </div>
                <div className="col-right">
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    {activeJobs} job{activeJobs !== 1 ? 's' : ''}
                  </span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    {totalCandidates} candidate{totalCandidates !== 1 ? 's' : ''}
                  </span>
                  <span className="badge badge-blue" style={{ fontSize: 10 }}>View Pipeline →</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
