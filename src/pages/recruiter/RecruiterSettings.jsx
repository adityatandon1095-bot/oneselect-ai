import { useState } from 'react'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import TwoFactorSection from '../../components/TwoFactorSection'

export default function RecruiterSettings() {
  const { user, profile } = useAuth()
  const [fullName,  setFullName]  = useState(profile?.full_name  ?? '')
  const [phone,     setPhone]     = useState(profile?.phone      ?? '')
  const [jobTitle,  setJobTitle]  = useState(profile?.job_title  ?? '')
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true); setSaved(false)
    await supabase.from('profiles').update({
      full_name: fullName.trim() || null,
      phone:     phone.trim()    || null,
      job_title: jobTitle.trim() || null,
    }).eq('id', user.id)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Settings</h2>
          <p>Your account details</p>
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
                <label>Full Name</label>
                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" />
              </div>
              <div className="field">
                <label>Job Title</label>
                <input type="text" value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="e.g. Senior Recruiter" />
              </div>
              <div className="field">
                <label>Phone</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+44 7700 000000" />
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

      <TwoFactorSection />

      <div className="section-card">
        <div className="section-card-head"><h3>Role &amp; Access</h3></div>
        <div className="section-card-body">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Recruiter</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Access to your assigned clients' pipelines. Managed by your One Select admin.</div>
            </div>
            <span className="badge badge-blue">Recruiter</span>
          </div>
        </div>
      </div>
    </div>
  )
}
