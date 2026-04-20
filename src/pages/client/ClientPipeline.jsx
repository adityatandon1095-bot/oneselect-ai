import { useAuth } from '../../lib/AuthContext'
import AdminPipeline from '../admin/AdminPipeline'

// Clients see the full pipeline (CV upload, AI screening, AI interview, verdicts)
// scoped exclusively to their own jobs (recruiter_id = user.id).
export default function ClientPipeline() {
  const { user } = useAuth()
  if (!user) return <div className="page"><span className="spinner" /></div>
  return <AdminPipeline allowedClientIds={[user.id]} />
}
