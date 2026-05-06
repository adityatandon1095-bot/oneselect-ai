import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const PLANS = {
  starter:    { label: 'Starter',    price: 800,  unit: '/role',  cls: 'badge-amber', description: 'Up to 20 candidates per role' },
  growth:     { label: 'Growth',     price: 1500, unit: '/month', cls: 'badge-blue',  description: 'Up to 5 active roles' },
  enterprise: { label: 'Enterprise', price: null, unit: 'custom', cls: 'badge-green', description: 'Unlimited roles + white label' },
}

const monthStart = () => {
  const d = new Date()
  d.setDate(1); d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function revenue(plan, rolesThisMonth) {
  if (!plan || plan === 'enterprise') return 'Custom'
  if (plan === 'starter')  return `£${(800 * rolesThisMonth).toLocaleString()}`
  if (plan === 'growth')   return '£1,500'
  return '—'
}

function mrrAmount(plan) {
  if (plan === 'growth')   return 1500
  if (plan === 'starter')  return 0
  return 0
}

const MO = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }
const MB = { background: 'var(--surface)', borderRadius: 12, padding: 28, width: 400, display: 'flex', flexDirection: 'column', gap: 16 }
const MI = { width: '100%', padding: '9px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' }

export default function AdminBilling() {
  const [clients,       setClients]       = useState([])
  const [usage,         setUsage]         = useState({}) // clientId → { roles, candidates, interviews }
  const [invoiceStatus, setInvoiceStatus] = useState({}) // clientId → 'pending'|'paid'|'overdue'
  const [loading,       setLoading]       = useState(true)
  const [planModal,     setPlanModal]     = useState(null)
  const [notesModal,    setNotesModal]    = useState(null)
  const [saving,        setSaving]        = useState(false)
  const [planSelect,    setPlanSelect]    = useState('starter')
  const [notesText,     setNotesText]     = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const ms = monthStart()
    const [
      { data: clientData },
      { data: jobData },
      { data: candData },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_role', 'client').order('company_name'),
      supabase.from('jobs').select('id, recruiter_id, created_at').limit(2000),
      supabase.from('candidates').select('job_id, created_at, scores').limit(2000),
    ])

    const allClients = clientData ?? []
    const allJobs = jobData ?? []
    const allCands = candData ?? []

    const usageMap = {}
    for (const c of allClients) {
      const clientJobs = allJobs.filter(j => j.recruiter_id === c.id)
      const clientJobIds = clientJobs.map(j => j.id)
      const rolesThisMonth = clientJobs.filter(j => j.created_at >= ms).length
      const cands = allCands.filter(c => clientJobIds.includes(c.job_id))
      const candsThisMonth = cands.filter(c => c.created_at >= ms).length
      const interviews = cands.filter(c => c.scores?.overallScore != null && c.created_at >= ms).length
      usageMap[c.id] = { roles: rolesThisMonth, candidates: candsThisMonth, interviews }
    }

    setClients(allClients)
    setUsage(usageMap)
    setLoading(false)
  }

  async function savePlan() {
    if (!planModal) return
    setSaving(true)
    await supabase.from('profiles').update({ plan: planSelect }).eq('id', planModal.id)
    setClients(p => p.map(c => c.id === planModal.id ? { ...c, plan: planSelect } : c))
    setPlanModal(null)
    setSaving(false)
  }

  async function saveNotes() {
    if (!notesModal) return
    setSaving(true)
    await supabase.from('profiles').update({ billing_notes: notesText }).eq('id', notesModal.id)
    setClients(p => p.map(c => c.id === notesModal.id ? { ...c, billing_notes: notesText } : c))
    setNotesModal(null)
    setSaving(false)
  }

  function toggleInvoice(clientId) {
    const cur = invoiceStatus[clientId] ?? 'pending'
    const next = cur === 'pending' ? 'paid' : cur === 'paid' ? 'overdue' : 'pending'
    setInvoiceStatus(p => ({ ...p, [clientId]: next }))
  }

  if (loading) return <div className="page" style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="spinner" /> Loading…</div>

  const totalMRR = clients.reduce((sum, c) => sum + mrrAmount(c.plan ?? 'starter'), 0)
  const totalRoles = Object.values(usage).reduce((sum, u) => sum + u.roles, 0)
  const totalCands = Object.values(usage).reduce((sum, u) => sum + u.candidates, 0)
  const totalIvs   = Object.values(usage).reduce((sum, u) => sum + u.interviews, 0)

  const invCls = { pending: 'badge-amber', paid: 'badge-green', overdue: 'badge-red' }

  return (
    <div className="page">
      <div className="page-head">
        <div><h2>Billing</h2><p>Revenue tracking and client plan management</p></div>
      </div>

      {/* Revenue Summary */}
      <div className="metrics-row">
        <div className="metric-card green">
          <span className="metric-val">£{totalMRR.toLocaleString()}</span>
          <span className="metric-label">MRR (Growth clients)</span>
        </div>
        <div className="metric-card blue">
          <span className="metric-val">{clients.length}</span>
          <span className="metric-label">Active Clients</span>
        </div>
        <div className="metric-card">
          <span className="metric-val">{totalRoles}</span>
          <span className="metric-label">Roles This Month</span>
        </div>
        <div className="metric-card amber">
          <span className="metric-val">{totalCands}</span>
          <span className="metric-label">Candidates This Month</span>
        </div>
      </div>

      {/* Pricing Plans Info */}
      <div className="section-card" style={{ marginBottom: 20 }}>
        <div className="section-card-head"><h3>Pricing Plans</h3></div>
        <div style={{ display: 'flex', gap: 12, padding: '16px 20px', flexWrap: 'wrap' }}>
          {Object.entries(PLANS).map(([key, plan]) => (
            <div key={key} style={{ flex: '1 1 180px', padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)' }}>
              <div style={{ fontFamily: 'var(--font-head)', fontSize: 18, marginBottom: 4 }}>{plan.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>
                {plan.price ? `£${plan.price.toLocaleString()}` : 'Custom'}
                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-3)' }}>{plan.unit}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{plan.description}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Client Table */}
      <div className="section-card">
        <div className="section-card-head"><h3>Client Billing</h3></div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Client', 'Plan', 'Roles/Mo', 'Candidates/Mo', 'Interviews', 'Invoice', 'Revenue', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.map(c => {
                const plan = c.plan ?? 'starter'
                const planCfg = PLANS[plan] ?? PLANS.starter
                const u = usage[c.id] ?? { roles: 0, candidates: 0, interviews: 0 }
                const inv = invoiceStatus[c.id] ?? 'pending'
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border2)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 500 }}>{c.company_name ?? c.full_name ?? c.email}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.email}</div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span className={`badge ${planCfg.cls}`} style={{ fontSize: 10 }}>{planCfg.label}</span>
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{u.roles}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{u.candidates}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'center' }}>{u.interviews}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <button
                        className={`badge ${invCls[inv]}`}
                        style={{ cursor: 'pointer', fontSize: 10, border: 'none', fontFamily: 'var(--font-body)' }}
                        onClick={() => toggleInvoice(c.id)}
                        title="Click to cycle: Pending → Paid → Overdue"
                      >
                        {inv.charAt(0).toUpperCase() + inv.slice(1)}
                      </button>
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {revenue(plan, u.roles)}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => { setPlanModal(c); setPlanSelect(plan) }}>Plan</button>
                        <button className="btn btn-secondary" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => { setNotesModal(c); setNotesText(c.billing_notes ?? '') }}>Notes</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600 }}>Totals</td>
                <td />
                <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'center', fontWeight: 600 }}>{totalRoles}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'center', fontWeight: 600 }}>{totalCands}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', textAlign: 'center', fontWeight: 600 }}>{totalIvs}</td>
                <td />
                <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--green)' }}>£{totalMRR.toLocaleString()}/mo MRR</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Plan Modal */}
      {planModal && (
        <div style={MO}>
          <div style={MB}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Change Plan</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{planModal.company_name ?? planModal.email}</div>
            </div>
            <div className="field">
              <label style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>Plan</label>
              <select style={MI} value={planSelect} onChange={e => setPlanSelect(e.target.value)}>
                {Object.entries(PLANS).map(([k, p]) => <option key={k} value={k}>{p.label} — {p.price ? `£${p.price}${p.unit}` : 'Custom'}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setPlanModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving} onClick={savePlan}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Notes Modal */}
      {notesModal && (
        <div style={MO}>
          <div style={MB}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Billing Notes</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{notesModal.company_name ?? notesModal.email}</div>
            </div>
            <div className="field">
              <textarea style={{ ...MI, height: 120, resize: 'vertical', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}
                value={notesText}
                onChange={e => setNotesText(e.target.value)}
                placeholder="Invoice dates, payment terms, custom agreements…"
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setNotesModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={saving} onClick={saveNotes}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
