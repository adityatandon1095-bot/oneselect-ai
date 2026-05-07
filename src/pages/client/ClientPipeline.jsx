import { useAuth } from '../../lib/AuthContext'
import { usePlan } from '../../hooks/usePlan'
import PaidFeature from '../../components/PaidFeature'
import AdminPipeline from '../admin/AdminPipeline'

export default function ClientPipeline() {
  const { user } = useAuth()
  const { canAccess } = usePlan()
  if (!user) return <div className="page"><span className="spinner" /></div>
  if (!canAccess('can_access_pipeline')) {
    return (
      <div className="page">
        <div className="page-head"><div><h2>Pipeline</h2><p>Full hiring pipeline view</p></div></div>
        <PaidFeature feature="can_access_pipeline">
          <div style={{ padding: 60, textAlign: 'center' }}>Pipeline locked</div>
        </PaidFeature>
      </div>
    )
  }
  return <AdminPipeline allowedClientIds={[user.id]} />
}
