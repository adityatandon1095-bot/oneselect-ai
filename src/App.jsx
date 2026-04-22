import { Component } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Login from './pages/Login'
import AdminLayout from './pages/admin/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminClients from './pages/admin/AdminClients'
import AdminJobs from './pages/admin/AdminJobs'
import AdminPipeline from './pages/admin/AdminPipeline'
import AdminTalentPool from './pages/admin/AdminTalentPool'
import AdminSettings from './pages/admin/AdminSettings'
import AdminRecruiters from './pages/admin/AdminRecruiters'
import RecruiterLayout from './pages/recruiter/RecruiterLayout'
import RecruiterDashboard from './pages/recruiter/RecruiterDashboard'
import RecruiterClients from './pages/recruiter/RecruiterClients'
import RecruiterJobs from './pages/recruiter/RecruiterJobs'
import RecruiterPipeline from './pages/recruiter/RecruiterPipeline'
import RecruiterSettings from './pages/recruiter/RecruiterSettings'
import ClientLayout from './pages/client/ClientLayout'
import ClientDashboard from './pages/client/ClientDashboard'
import ClientJobs from './pages/client/ClientJobs'
import ClientPipeline from './pages/client/ClientPipeline'
import ClientCandidates from './pages/client/ClientCandidates'
import ClientReports from './pages/client/ClientReports'
import ClientSettings from './pages/client/ClientSettings'
import PublicVideoInterview from './pages/PublicVideoInterview'
import PublicLiveInterview from './pages/PublicLiveInterview'
import './App.css'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-body)' }}>
          <div style={{ fontSize: 32, opacity: 0.2 }}>◈</div>
          <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 300, margin: 0 }}>Something went wrong</h2>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0, maxWidth: 400, textAlign: 'center' }}>
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function Loader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
      <span className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )
}

function roleHome(role) {
  if (role === 'admin') return '/admin/dashboard'
  if (role === 'client') return '/client/dashboard'
  return '/recruiter/dashboard'
}

function ProtectedRoute({ children, role }) {
  const { user, profile, profileLoading, loading } = useAuth()
  if (loading || profileLoading) return <Loader />
  if (!user) return <Navigate to="/login" replace />
  if (role && profile && profile.user_role !== role) {
    return <Navigate to={roleHome(profile.user_role)} replace />
  }
  return children
}

function RootRedirect() {
  const { user, profile, profileLoading, loading } = useAuth()
  if (loading || profileLoading) return <Loader />
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={roleHome(profile?.user_role)} replace />
}

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/interview/:token" element={<PublicVideoInterview />} />
          <Route path="/live/:token" element={<PublicLiveInterview />} />
          <Route path="/" element={<RootRedirect />} />

          <Route path="/admin" element={<ProtectedRoute role="admin"><AdminLayout /></ProtectedRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="clients" element={<AdminClients />} />
            <Route path="recruiters" element={<AdminRecruiters />} />
            <Route path="jobs" element={<AdminJobs />} />
            <Route path="pipeline" element={<AdminPipeline />} />
            <Route path="talent-pool" element={<AdminTalentPool />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>

          <Route path="/recruiter" element={<ProtectedRoute role="recruiter"><RecruiterLayout /></ProtectedRoute>}>
            <Route index element={<RecruiterDashboard />} />
            <Route path="dashboard" element={<RecruiterDashboard />} />
            <Route path="clients" element={<RecruiterClients />} />
            <Route path="jobs" element={<RecruiterJobs />} />
            <Route path="talent-pool" element={<AdminTalentPool />} />
            <Route path="pipeline" element={<RecruiterPipeline />} />
            <Route path="settings" element={<RecruiterSettings />} />
          </Route>

          <Route path="/client" element={<ProtectedRoute role="client"><ClientLayout /></ProtectedRoute>}>
            <Route index element={<ClientDashboard />} />
            <Route path="dashboard" element={<ClientDashboard />} />
            <Route path="jobs" element={<ClientJobs />} />
            <Route path="pipeline" element={<ClientPipeline />} />
            <Route path="candidates" element={<ClientCandidates />} />
            <Route path="reports" element={<ClientReports />} />
            <Route path="settings" element={<ClientSettings />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  )
}
