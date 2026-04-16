import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function AdminRecruiters() {
  const [recruiters, setRecruiters] = useState([])
  const [clients, setClients] = useState([])
  const [assignments, setAssignments] = useState([]) // { recruiter_id, client_id }
  const [loading, setLoading] = useState(true)

  // Invite state
  const [showInvite, setShowInvite] = useState(false)
  const [invName,  setInvName]  = useState('')
  const [invEmail, setInvEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [invError, setInvError] = useState('')
  const [invResult, setInvResult] = useState(null)

  // Assignment modal state
  const [assignModal, setAssignModal] = useState(null) // recruiter profile
  const [assignClientId, setAssignClientId] = useState('')
  const [assigning, setAssigning] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: recs }, { data: cls }, { data: asgn }] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_role', 'recruiter').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, company_name, full_name, email').eq('user_role', 'client').order('company_name'),
      supabase.from('recruiter_clients').select('recruiter_id, client_id, profiles!recruiter_clients_client_id_fkey(id, company_name, email)'),
    ])
    setRecruiters(recs ?? [])
    setClients(cls ?? [])
    setAssignments(asgn ?? [])
    setLoading(false)
  }

  function assignedClients(recruiterId) {
    return assignments
      .filter(a => a.recruiter_id === recruiterId)
      .map(a => a.profiles)
      .filter(Boolean)
  }

  async function handleInvite() {
    if (!invEmail.trim()) { setInvError('Email is required'); return }
    setInviting(true); setInvError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({
          email:        invEmail.trim().toLowerCase(),
          contact_name: invName.trim() || invEmail.trim().toLowerCase(),
          company_name: 'One Select',
          role:         'recruiter',
        }),
      })
      const result = await res.json()
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

  async function handleAssign() {
    if (!assignClientId || !assignModal) return
    setAssigning(true)
    const { error } = await supabase.from('recruiter_clients').insert({
      recruiter_id: assignModal.id,
      client_id: assignClientId,
    })
    setAssigning(false)
    if (!error) {
      setAssignModal(null)
      setAssignClientId('')
      await load()
    }
  }

  async function handleUnassign(recruiterId, clientId) {
    await supabase.from('recruiter_clients').delete()
      .eq('recruiter_id', recruiterId)
      .eq('client_id', clientId)
    await load()
  }

  async function handleRemove(r) {
    const label = r.full_name || r.email
    if (!window.confirm(`Remove recruiter ${label}?\n\nThis removes their account. Their client assignments will be deleted.`)) return
    await supabase.from('profiles').delete().eq('id', r.id)
    setRecruiters(p => p.filter(x => x.id !== r.id))
  }

  if (loading) return <div className="page"><span className="spinner" /></div>

  const unassignedClients = (recruiterId) =>
    clients.filter(c => !assignments.some(a => a.recruiter_id === recruiterId && a.client_id === c.id))

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Recruiters</h2>
          <p>{recruiters.length} internal recruiter{recruiters.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setInvName(''); setInvEmail(''); setInvError(''); setShowInvite(true) }}>
          + Invite Recruiter
        </button>
      </div>

      {recruiters.length === 0 ? (
        <div className="section-card">
          <div className="empty-state">
            <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.3 }}>◉</div>
            <div style={{ fontWeight: 400, color: 'var(--text-2)', marginBottom: 6 }}>No recruiters yet</div>
            <div style={{ fontSize: 12 }}>Invite your first recruiter to get started.</div>
          </div>
        </div>
      ) : (
        <div className="section-card">
          <div className="section-card-head"><h3>All Recruiters</h3></div>
          {recruiters.map(r => {
            const assigned = assignedClients(r.id)
            return (
              <div key={r.id} style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div className="profile-avatar" style={{ width: 36, height: 36, fontSize: 15, borderRadius: 'var(--r)', flexShrink: 0 }}>
                    {(r.full_name || r.email || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text)' }}>{r.full_name || '—'}</div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', marginTop: 2 }}>{r.email}</div>

                    {/* Assigned clients */}
                    <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {assigned.length === 0 ? (
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>No clients assigned</span>
                      ) : (
                        assigned.map(c => (
                          <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '3px 8px', color: 'var(--text-2)' }}>
                            {c.company_name || c.email}
                            <button
                              onClick={() => handleUnassign(r.id, c.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 12, lineHeight: 1, padding: '0 0 0 2px' }}
                              title="Remove assignment"
                            >×</button>
                          </span>
                        ))
                      )}
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 10, padding: '3px 8px' }}
                        onClick={() => { setAssignModal(r); setAssignClientId('') }}
                      >
                        + Assign Client
                      </button>
                    </div>
                  </div>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 10, padding: '3px 8px', color: 'var(--red)', flexShrink: 0 }}
                    onClick={() => handleRemove(r)}
                  >Remove</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Invite Modal ── */}
      {showInvite && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowInvite(false) }}>
          <div className="modal">
            <div className="modal-head">
              <h3>Invite Recruiter</h3>
              <button className="modal-close" onClick={() => setShowInvite(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="field span-2">
                  <label>Full Name</label>
                  <input type="text" placeholder="Jane Smith" value={invName} onChange={e => setInvName(e.target.value)} autoFocus />
                </div>
                <div className="field span-2">
                  <label>Email Address *</label>
                  <input
                    type="email" placeholder="jane@oneselect.ai"
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

      {/* ── Invite Result Modal ── */}
      {invResult && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-head">
              <h3 style={{ color: 'var(--green)' }}>Recruiter Invited!</h3>
            </div>
            <div className="modal-body">
              <div style={{ padding: '10px 14px', marginBottom: 20, fontSize: 13, background: invResult.emailSent ? 'var(--green-d)' : 'var(--amber-d)', borderLeft: `2px solid ${invResult.emailSent ? 'var(--green)' : 'var(--amber)'}`, color: invResult.emailSent ? 'var(--green)' : 'var(--amber)' }}>
                {invResult.emailSent ? `✓ Welcome email sent to ${invResult.email}` : '⚠ Email failed — copy and share manually'}
              </div>
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 20px', marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-3)', marginBottom: 14 }}>Login Details</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', width: 72, flexShrink: 0 }}>Email</span>
                    <span style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{invResult.email}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', width: 72, flexShrink: 0 }}>Password</span>
                    <span style={{ fontSize: 24, color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.15em' }}>{invResult.password}</span>
                  </div>
                </div>
              </div>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setInvResult(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign Client Modal ── */}
      {assignModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setAssignModal(null) }}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <h3>Assign Client to {assignModal.full_name || assignModal.email}</h3>
              <button className="modal-close" onClick={() => setAssignModal(null)}>×</button>
            </div>
            <div className="modal-body">
              {unassignedClients(assignModal.id).length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-2)' }}>All clients are already assigned to this recruiter.</p>
              ) : (
                <>
                  <div className="field">
                    <label>Select Client</label>
                    <select value={assignClientId} onChange={e => setAssignClientId(e.target.value)}>
                      <option value="">— choose client —</option>
                      {unassignedClients(assignModal.id).map(c => (
                        <option key={c.id} value={c.id}>{c.company_name || c.email}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-actions" style={{ marginTop: 20 }}>
                    <button className="btn btn-primary" disabled={!assignClientId || assigning} onClick={handleAssign}>
                      {assigning ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Assigning…</> : 'Assign'}
                    </button>
                    <button className="btn btn-secondary" onClick={() => setAssignModal(null)}>Cancel</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
