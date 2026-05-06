import { useAuth } from '../../lib/AuthContext'
import TwoFactorSection from '../../components/TwoFactorSection'

export default function RecruiterSettings() {
  const { user } = useAuth()

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
          <div className="form-grid">
            <div className="field">
              <label>Email</label>
              <input type="email" value={user?.email ?? ''} readOnly style={{ opacity: 0.5, cursor: 'not-allowed' }} />
            </div>
          </div>
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
