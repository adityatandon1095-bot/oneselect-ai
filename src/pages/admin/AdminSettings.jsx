import { useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'

export default function AdminSettings() {
  const { user, profile } = useAuth()
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
          <p>Manage your account and platform configuration</p>
        </div>
      </div>

      {/* Account */}
      <div className="section-card" style={{ marginBottom: 16 }}>
        <div className="section-card-head"><h3>Account</h3></div>
        <div className="section-card-body">
          <form onSubmit={handleSave}>
            <div className="form-grid">
              <div className="field">
                <label>Email</label>
                <input type="email" value={user?.email ?? ''} readOnly style={{ opacity: 0.5, cursor: 'not-allowed' }} />
              </div>
              <div className="field">
                <label>Company / Platform Name</label>
                <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. One Select" />
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

      {/* Role */}
      <div className="section-card" style={{ marginBottom: 16 }}>
        <div className="section-card-head"><h3>Role &amp; Access</h3></div>
        <div className="section-card-body">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Administrator</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Full access to all clients, jobs, pipeline and platform settings</div>
            </div>
            <span className="badge badge-blue">Admin</span>
          </div>
        </div>
      </div>

      {/* AI Model */}
      <div className="section-card">
        <div className="section-card-head"><h3>AI Configuration</h3></div>
        <div className="section-card-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { step: 'CV Parsing',    desc: 'Extracts name, role, skills and experience from uploaded CVs' },
              { step: 'Screening',     desc: 'Scores candidates against job requirements, returns match /100' },
              { step: 'Interviews',    desc: 'Conducts personalised multi-turn AI interviews per CV' },
              { step: 'Scoring',       desc: 'Evaluates interviews across 5 dimensions and gives a recommendation' },
            ].map(({ step, desc }) => (
              <div key={step} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', background: 'var(--surface2)', borderRadius: 'var(--r)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{step}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{desc}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.04em' }}>claude-sonnet-4</div>
                  <span className="badge badge-green" style={{ marginTop: 4 }}>Active</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
