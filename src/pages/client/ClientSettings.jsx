import { useState, useEffect } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'

function subLabel(st) {
  if (st === 'active')    return { label: 'Active',    cls: 'badge-green' }
  if (st === 'suspended') return { label: 'Suspended', cls: 'badge-red'   }
  return                         { label: 'Trial',     cls: 'badge-amber' }
}

export default function ClientSettings() {
  const { user, profile } = useAuth()
  const [plan, setPlan] = useState(null)

  useEffect(() => {
    if (profile?.plan_id) {
      supabase.from('plans').select('*').eq('id', profile.plan_id).single()
        .then(({ data }) => setPlan(data ?? null))
    }
  }, [profile?.plan_id])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [companyName, setCompanyName] = useState(profile?.company_name ?? '')

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    await supabase.from('profiles').update({ company_name: companyName }).eq('id', user.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Settings</h2>
          <p>Manage your account details</p>
        </div>
      </div>

      <div className="section-card" style={{ marginBottom: 16 }}>
        <div className="section-card-head"><h3>Profile</h3></div>
        <div className="section-card-body">
          <form onSubmit={handleSave}>
            <div className="form-grid">
              <div className="field">
                <label>Email</label>
                <input type="email" value={user?.email ?? ''} readOnly style={{ opacity: 0.5, cursor: 'not-allowed' }} />
              </div>
              <div className="field">
                <label>Company Name</label>
                <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Your company name" />
              </div>
            </div>
            <div className="form-actions" style={{ marginTop: 20 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Saving…</> : 'Save Changes'}
              </button>
              {saved && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', letterSpacing: '0.06em' }}>✓ Saved</span>}
            </div>
          </form>
        </div>
      </div>

      <div className="section-card" style={{ marginBottom: 16 }}>
        <div className="section-card-head"><h3>Role &amp; Access</h3></div>
        <div className="section-card-body">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Client</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Access to your jobs, candidates, and reports. CVs are uploaded and screened by your One Select recruiter.</div>
            </div>
            <span className="badge badge-blue">Client</span>
          </div>
        </div>
      </div>

      <div className="section-card">
        <div className="section-card-head"><h3>Subscription</h3></div>
        <div className="section-card-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                {plan ? plan.name : 'No plan assigned'}
              </div>
              {plan?.description && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{plan.description}</div>}
              {plan?.price_monthly != null && (
                <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--accent)', marginTop: 4 }}>
                  £{Number(plan.price_monthly).toFixed(0)} / month
                </div>
              )}
              {profile?.subscription_started_at && (
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                  Active since {new Date(profile.subscription_started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              )}
            </div>
            <span className={`badge ${subLabel(profile?.subscription_status).cls}`}>
              {subLabel(profile?.subscription_status).label}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
