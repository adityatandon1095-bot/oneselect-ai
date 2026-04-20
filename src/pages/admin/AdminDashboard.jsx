import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({ clients: 0, jobs: 0, candidates: 0, interviews: 0, poolTotal: 0, poolAvailable: 0 })
  const [recentJobs, setRecentJobs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const [
      { count: clients },
      { count: jobs },
      { count: candidates },
      { count: interviews },
      { data: recent },
      { count: poolTotal },
      { count: poolAvailable },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('user_role', 'client'),
      supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('candidates').select('*', { count: 'exact', head: true }),
      supabase.from('candidates').select('*', { count: 'exact', head: true }).not('scores', 'is', null),
      supabase.from('jobs').select('id, title, status, created_at, profiles(company_name)').order('created_at', { ascending: false }).limit(8),
      supabase.from('talent_pool').select('*', { count: 'exact', head: true }),
      supabase.from('talent_pool').select('*', { count: 'exact', head: true }).eq('availability', 'available'),
    ])
    setStats({ clients: clients ?? 0, jobs: jobs ?? 0, candidates: candidates ?? 0, interviews: interviews ?? 0, poolTotal: poolTotal ?? 0, poolAvailable: poolAvailable ?? 0 })
    setRecentJobs(recent ?? [])
    setLoading(false)
  }

  if (loading) return <div className="page" style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="spinner" /> Loading…</div>

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Dashboard</h2>
          <p>Platform-wide overview</p>
        </div>
      </div>

      <div className="metrics-row">
        <div className="metric-card blue">
          <span className="metric-val">{stats.clients}</span>
          <span className="metric-label">Total Clients</span>
        </div>
        <div className="metric-card">
          <span className="metric-val">{stats.jobs}</span>
          <span className="metric-label">Active Jobs</span>
        </div>
        <div className="metric-card amber">
          <span className="metric-val">{stats.candidates}</span>
          <span className="metric-label">Candidates Processed</span>
        </div>
        <div className="metric-card green">
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
        <div className="metric-card" style={{ opacity: 0 }} />
        <div className="metric-card" style={{ opacity: 0 }} />
      </div>

      <div className="section-card">
        <div className="section-card-head"><h3>Recent Jobs</h3></div>
        {recentJobs.length === 0
          ? <div className="empty-state">No jobs yet</div>
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
