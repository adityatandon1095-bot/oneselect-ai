import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import VideoInterview from '../../components/VideoInterview'

export default function CandidateInterview() {
  const { source, matchId } = useParams()  // source: 'cv' | 'pool'
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    load()
  }, [matchId, source])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      if (source === 'cv') {
        const { data: candidate, error: err } = await supabase
          .from('candidates')
          .select('id, full_name, email, candidate_role, job_id, video_urls, jobs(id, title, description, required_skills, experience_years)')
          .eq('id', matchId)
          .single()

        if (err) throw err
        // Verify this candidate belongs to the logged-in user
        if (candidate.email !== user.email) throw new Error('Unauthorized')

        setData({
          job: candidate.jobs,
          candidate: { id: candidate.id, full_name: candidate.full_name, email: candidate.email, candidate_role: candidate.candidate_role ?? '' },
          matchId: candidate.id,
          isFromPool: false,
        })
      } else {
        // pool match
        const { data: match, error: matchErr } = await supabase
          .from('job_matches')
          .select('id, job_id, video_urls, jobs(id, title, description, required_skills, experience_years), talent_pool(id, full_name, email, candidate_role)')
          .eq('id', matchId)
          .single()

        if (matchErr) throw matchErr
        if (match.talent_pool?.email !== user.email) throw new Error('Unauthorized')

        setData({
          job: match.jobs,
          candidate: { id: match.talent_pool.id, full_name: match.talent_pool.full_name, email: match.talent_pool.email, candidate_role: match.talent_pool.candidate_role ?? '' },
          matchId: match.id,
          isFromPool: true,
        })
      }
    } catch (e) {
      console.error(e)
      setError(e.message)
      setLoading(false)
    }
  }

  function handleComplete() {
    navigate('/candidate/dashboard')
  }

  function handleClose() {
    navigate('/candidate/dashboard')
  }

  if (loading && !data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <span className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )

  if (error) return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{ fontSize: 15, color: 'var(--red)', marginBottom: 8 }}>Could not load interview</div>
      <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>{error}</div>
      <button className="btn btn-secondary" onClick={() => navigate('/candidate/dashboard')}>Back to Dashboard</button>
    </div>
  )

  if (!data) return null

  return (
    <VideoInterview
      job={data.job}
      candidate={data.candidate}
      matchId={data.matchId}
      isFromPool={data.isFromPool}
      onClose={handleClose}
      onComplete={handleComplete}
    />
  )
}
