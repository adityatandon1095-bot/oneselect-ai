import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const STATUS_OPTS = ['all', 'active', 'closed', 'draft']

export default function AdminJobs() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const clientId  = location.state?.clientId   ?? null
  const clientName = location.state?.clientName ?? null

  const [jobs, setJobs]     = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    let query = supabase
      .from('jobs')
      .select('*, profiles(company_name, email)')
      .order('created_at', { ascending: false })
    if (clientId) query = query.eq('recruiter_id', clientId)
    const { data } = await query
    setJobs(data ?? [])
    setLoading(false)
  }

  const filtered = filter === 'all' ? jobs : jobs.filter((j) => j.status === filter)

  if (loading) return <div className="page"><span className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-head">
        <div>
          {clientName ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: '3px 8px' }}
                  onClick={() => navigate('/admin/clients')}
                >
                  ← Clients
                </button>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>{clientName}</span>
              </div>
              <h2>Jobs</h2>
              <p>{jobs.length} job{jobs.length !== 1 ? 's' : ''} for this client</p>
            </>
          ) : (
            <>
              <h2>All Jobs</h2>
              <p>{jobs.length} job{jobs.length !== 1 ? 's' : ''} across all clients</p>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {STATUS_OPTS.map((s) => (
            <button
              key={s}
              className={`btn ${filter === s ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 12px', fontSize: 12, textTransform: 'capitalize' }}
              onClick={() => setFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="section-card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            {clientId ? 'No jobs created for this client yet.' : 'No jobs match this filter.'}
          </div>
        ) : (
          filtered.map((j) => (
            <div key={j.id} className="table-row">
              <div className="col-main">
                <div className="col-name">{j.title}</div>
                <div className="col-sub">
                  {j.profiles?.company_name ?? j.profiles?.email ?? 'Unknown'} · {j.experience_years ?? 0}+ yrs
                </div>
              </div>
              <div className="col-right">
                <span className={`badge ${j.status === 'active' ? 'badge-green' : j.status === 'closed' ? 'badge-red' : 'badge-amber'}`}>
                  {j.status ?? 'active'}
                </span>
                <span className="mono text-muted" style={{ fontSize: 11 }}>
                  {new Date(j.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
