import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'

const NAV = [
  { to: '/candidate/dashboard', label: 'Dashboard', icon: '◈' },
  { to: '/candidate/matches',   label: 'My Matches', icon: '◎' },
  { to: '/candidate/profile',   label: 'My Profile',  icon: '◌' },
]

export default function CandidateLayout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/candidate/login', { replace: true })
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/oneselect-logo.png" alt="One Select" style={{ width: '100%', maxWidth: 160, height: 'auto', objectFit: 'contain', display: 'block' }} />
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">Candidate</div>
          {NAV.map(item => (
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
          <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
