import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function AdminClients() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_role', 'recruiter')
      .order('created_at', { ascending: false })
    setClients(data ?? [])
    setLoading(false)
  }

  async function handleInvite(e) {
    e.preventDefault()
    setInviteMsg('')
    // supabase.auth.admin.inviteUserByEmail requires service-role key (not available in browser)
    // Instruct the admin to use the Supabase dashboard or a server-side function
    setInviteMsg(`To invite ${inviteEmail}: go to your Supabase dashboard → Authentication → Users → Invite user, or call inviteUserByEmail() from a secure server-side function with the service role key.`)
    setInviteEmail('')
  }

  if (loading) return <div className="page"><span className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Clients</h2>
          <p>{clients.length} recruiter account{clients.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowInvite(!showInvite); setInviteMsg('') }}>
          + Invite Client
        </button>
      </div>

      {showInvite && (
        <div className="section-card" style={{ marginBottom: 20 }}>
          <div className="section-card-head"><h3>Invite New Client</h3></div>
          <div className="section-card-body">
            <form onSubmit={handleInvite} style={{ display: 'flex', gap: 10 }}>
              <input
                type="email" required placeholder="client@company.com"
                value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn btn-primary">Send Invite</button>
            </form>
            {inviteMsg && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--amber-d)', borderLeft: '2px solid var(--amber)', fontSize: 12, color: 'var(--amber)', lineHeight: 1.6 }}>
                {inviteMsg}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="section-card">
        <div className="section-card-head">
          <h3>All Clients</h3>
          <span className="mono text-muted" style={{ fontSize: 11 }}>{clients.length} total</span>
        </div>
        {clients.length === 0
          ? <div className="empty-state">No clients yet. Invite your first client above.</div>
          : clients.map((c) => (
            <div key={c.id} className="table-row">
              <div className="profile-avatar" style={{ width: 32, height: 32, fontSize: 13, borderRadius: 8, flexShrink: 0 }}>
                {(c.company_name ?? c.email ?? '?')[0].toUpperCase()}
              </div>
              <div className="col-main">
                <div className="col-name">{c.company_name ?? '—'}</div>
                <div className="col-sub">{c.email}</div>
              </div>
              <div className="col-right">
                <span className="badge badge-blue">Recruiter</span>
                <span className="mono text-muted" style={{ fontSize: 11 }}>
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )
}
