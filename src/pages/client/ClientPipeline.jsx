import { useAuth } from '../../lib/AuthContext'
import AdminPipeline from '../admin/AdminPipeline'

export default function ClientPipeline() {
  const { user } = useAuth()
  if (!user) return <div className="page"><span className="spinner" /></div>
  return <AdminPipeline allowedClientIds={[user.id]} />
}
