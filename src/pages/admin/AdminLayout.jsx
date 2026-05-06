import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'

const NAV = [
  { to: '/admin/dashboard',   label: 'Dashboard',       icon: '◈' },
  { to: '/admin/clients',     label: 'Clients',         icon: '◉' },
  { to: '/admin/recruiters',  label: 'Recruiters',      icon: '◎' },
  { to: '/admin/jobs',        label: 'Jobs',            icon: '◫' },
  { to: '/admin/talent-pool', label: 'Talent Pool',     icon: '◌' },
  { to: '/admin/sourcing',    label: 'Sourcing',        icon: '◍' },
  { to: '/admin/pipeline',    label: 'Pipeline',        icon: '◐' },
  { to: '/admin/board',       label: 'Pipeline Board',  icon: '▦'  },
  { to: '/admin/compliance',  label: 'Compliance',      icon: '◑'  },
  { to: '/admin/analytics',   label: 'Analytics',       icon: '◱'  },
  { to: '/admin/billing',     label: 'Billing',         icon: '◇'  },
  { to: '/admin/settings',    label: 'Settings',        icon: '◷'  },
]

export default function AdminLayout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/oneselect-logo.png" alt="One Select" style={{ width: '100%', maxWidth: 160, height: 'auto', objectFit: 'contain', display: 'block' }} />
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">Admin</div>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
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
    </div>
  )
}
