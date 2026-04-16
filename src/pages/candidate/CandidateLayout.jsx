import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'

export default function CandidateLayout() {
  const { profile, signOut } = useAuth()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Top nav */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        padding: '0 32px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/oneselect-logo.svg" alt="One Select" style={{ height: 28 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Candidate Portal
          </span>
        </div>

        {/* Nav links */}
        <nav style={{ display: 'flex', gap: 4 }}>
          {[
            { to: '/candidate/dashboard', label: 'My Applications' },
            { to: '/candidate/profile',   label: 'My Profile' },
          ].map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 13,
                color: isActive ? 'var(--text)' : 'var(--text-3)',
                background: isActive ? 'var(--bg)' : 'transparent',
                textDecoration: 'none',
                fontFamily: 'var(--font-body)',
              })}
            >{label}</NavLink>
          ))}
        </nav>

        {/* User + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{profile?.full_name || profile?.email}</span>
          <button
            onClick={signOut}
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '5px 12px' }}
          >Sign out</button>
        </div>
      </header>

      {/* Page content */}
      <main style={{ flex: 1, padding: '32px', maxWidth: 860, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <Outlet />
      </main>
    </div>
  )
}
