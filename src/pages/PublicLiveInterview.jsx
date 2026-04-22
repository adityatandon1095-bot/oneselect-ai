import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function PublicLiveInterview() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [joined, setJoined] = useState(false)

  useEffect(() => { load() }, [token])

  async function load() {
    setLoading(true)

    const { data: cRow } = await supabase
      .from('candidates')
      .select('full_name, candidate_role, live_room_url, jobs(title)')
      .eq('live_interview_token', token)
      .maybeSingle()

    if (cRow) {
      setData({ name: cRow.full_name, role: cRow.candidate_role, roomUrl: cRow.live_room_url, jobTitle: cRow.jobs?.title })
      setLoading(false)
      return
    }

    const { data: mRow } = await supabase
      .from('job_matches')
      .select('live_room_url, jobs(title), talent_pool(full_name, candidate_role)')
      .eq('live_interview_token', token)
      .maybeSingle()

    if (mRow) {
      setData({ name: mRow.talent_pool?.full_name, role: mRow.talent_pool?.candidate_role, roomUrl: mRow.live_room_url, jobTitle: mRow.jobs?.title })
      setLoading(false)
      return
    }

    setError('Invalid or expired interview link.')
    setLoading(false)
  }

  if (loading) {
    return (
      <div style={pageStyle}>
        <span className="spinner" style={{ width: 36, height: 36 }} />
      </div>
    )
  }

  if (error) {
    return (
      <div style={pageStyle}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.3 }}>◈</div>
          <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 300, marginBottom: 8 }}>Link not found</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 14 }}>{error}</p>
        </div>
      </div>
    )
  }

  if (joined && data?.roomUrl) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 16px', background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#B8924A', fontFamily: 'monospace', fontSize: 13, letterSpacing: '0.1em' }}>ONE SELECT</span>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>·</span>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{data.jobTitle} — Live Interview</span>
          </div>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
        </div>
        <iframe
          src={data.roomUrl}
          style={{ flex: 1, border: 'none', width: '100%' }}
          allow="camera; microphone; fullscreen; display-capture"
          title="Live Interview"
        />
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 480, width: '100%', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 300, letterSpacing: '0.15em', color: '#B8924A', marginBottom: 6, fontSize: 22 }}>ONE SELECT</h1>
          <p style={{ color: 'var(--text-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Live Interview</p>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '32px 28px', textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(184,146,74,0.1)', border: '2px solid rgba(184,146,74,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 24 }}>🎥</div>
          <h2 style={{ fontSize: 20, fontWeight: 500, margin: '0 0 8px' }}>Hi {data?.name}</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 14, margin: '0 0 6px' }}>You're joining a live interview for</p>
          <p style={{ fontWeight: 600, fontSize: 15, margin: '0 0 28px' }}>{data?.jobTitle}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28, textAlign: 'left' }}>
            {[
              'Ensure you are in a quiet, well-lit place',
              'Camera and microphone access required',
              'The interviewer will join when ready',
            ].map((tip, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#B8924A', marginTop: 6, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{tip}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => setJoined(true)}
            style={{ width: '100%', padding: '14px 0', background: '#B8924A', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase' }}
          >
            Join Interview →
          </button>
        </div>

        <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 11, marginTop: 20, letterSpacing: '0.06em' }}>
          ONE SELECT — STRATEGIC TALENT SOLUTIONS
        </p>
      </div>
    </div>
  )
}

const pageStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontFamily: 'var(--font-body)',
}
