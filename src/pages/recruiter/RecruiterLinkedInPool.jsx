import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import AdminLinkedInPool from '../admin/AdminLinkedInPool'

export default function RecruiterLinkedInPool() {
  const { user } = useAuth()
  const [clientIds, setClientIds] = useState(null)

  useEffect(() => {
    if (!user) return
    supabase
      .from('recruiter_clients')
      .select('client_id')
      .eq('recruiter_id', user.id)
      .then(({ data }) => setClientIds((data ?? []).map(r => r.client_id)))
  }, [user])

  if (clientIds === null) return <div className="page"><span className="spinner" /></div>

  return <AdminLinkedInPool allowedClientIds={clientIds} />
}
