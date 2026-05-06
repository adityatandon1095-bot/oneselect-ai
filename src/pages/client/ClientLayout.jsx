import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import ChatBubble from '../../components/ChatBubble'

const NAV = [
  { to: '/client/dashboard',  label: 'Dashboard',    icon: '◈' },
  { to: '/client/jobs',       label: 'My Jobs',      icon: '◫' },
  { to: '/client/candidates', label: 'Candidates',   icon: '◉' },
  { to: '/client/reports',    label: 'Reports',      icon: '◧' },
  { to: '/client/chat',       label: 'AI Assistant', icon: '◎' },
  { to: '/client/settings',   label: 'Settings',     icon: '◷' },
]

export default function ClientLayout() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  if (profile?.subscription_status === 'suspended') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-body)', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 32, opacity: 0.2 }}>◉</div>
        <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 300, margin: 0 }}>Subscription Suspended</h2>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0, maxWidth: 400, lineHeight: 1.7 }}>
          Your account access has been suspended. Please contact your One Select account manager to reinstate your subscription.
        </p>
        <button className="btn btn-secondary" onClick={handleSignOut}>Sign out</button>
      </div>
    )
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/oneselect-logo.png" alt="One Select" style={{ width: '100%', maxWidth: 160, height: 'auto', objectFit: 'contain', display: 'block' }} />
        </div>
        {profile?.company_name && (
          <div className="sidebar-company">{profile.company_name}</div>
        )}

        <nav className="sidebar-nav">
          <div className="nav-section">Client Portal</div>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-email">{user?.email}</div>
          <button
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
      <ChatBubble />
    </div>
  )
}
