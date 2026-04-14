import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Login from './pages/Login'
import AdminLayout from './pages/admin/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminClients from './pages/admin/AdminClients'
import AdminJobs from './pages/admin/AdminJobs'
import AdminPipeline from './pages/admin/AdminPipeline'
import AdminSettings from './pages/admin/AdminSettings'
import RecruiterLayout from './pages/recruiter/RecruiterLayout'
import RecruiterDashboard from './pages/recruiter/RecruiterDashboard'
import RecruiterJobs from './pages/recruiter/RecruiterJobs'
import RecruiterCandidates from './pages/recruiter/RecruiterCandidates'
import RecruiterReports from './pages/recruiter/RecruiterReports'
import RecruiterSettings from './pages/recruiter/RecruiterSettings'
import './App.css'

function Loader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
      <span className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )
}

function ProtectedRoute({ children, role }) {
  const { user, profile, profileLoading, loading } = useAuth()
  if (loading || profileLoading) return <Loader />
  if (!user) return <Navigate to="/login" replace />
  if (role && profile && profile.user_role !== role) {
    return <Navigate to={profile.user_role === 'admin' ? '/admin/dashboard' : '/recruiter/dashboard'} replace />
  }
  return children
}

function RootRedirect() {
  const { user, profile, profileLoading, loading } = useAuth()
  if (loading || profileLoading) return <Loader />
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={profile?.user_role === 'admin' ? '/admin/dashboard' : '/recruiter/dashboard'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RootRedirect />} />

          <Route path="/admin" element={<ProtectedRoute role="admin"><AdminLayout /></ProtectedRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="clients" element={<AdminClients />} />
            <Route path="jobs" element={<AdminJobs />} />
            <Route path="pipeline" element={<AdminPipeline />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>

          <Route path="/recruiter" element={<ProtectedRoute role="recruiter"><RecruiterLayout /></ProtectedRoute>}>
            <Route index element={<RecruiterDashboard />} />
            <Route path="dashboard" element={<RecruiterDashboard />} />
            <Route path="jobs" element={<RecruiterJobs />} />
            <Route path="candidates" element={<RecruiterCandidates />} />
            <Route path="reports" element={<RecruiterReports />} />
            <Route path="settings" element={<RecruiterSettings />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
