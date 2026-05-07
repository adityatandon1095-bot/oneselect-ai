import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import VideoInterview from '../components/VideoInterview'

export default function PublicVideoInterview() {
  const { token } = useParams()
  const [data, setData] = useState(null)      // { candidate, job, table }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [showInterview, setShowInterview] = useState(false)

  useEffect(() => { load() }, [token])

  async function load() {
    setLoading(true)
    setError('')

    // Try candidates table first
    const { data: cRow } = await supabase
      .from('candidates')
      .select('*, jobs(*)')
      .eq('interview_invite_token', token)
      .maybeSingle()

    if (cRow) {
      if (cRow.video_urls?.length > 0) { setDone(true); setLoading(false); return }
      if (cRow.interview_token_expires_at && new Date(cRow.interview_token_expires_at) < new Date()) {
        setError(`expired:${new Date(cRow.interview_token_expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`)
        setLoading(false); return
      }
      setData({ candidate: cRow, job: cRow.jobs, table: 'candidates' })
      setLoading(false)
      return
    }

    // Try job_matches (talent pool)
    const { data: mRow } = await supabase
      .from('job_matches')
      .select('*, talent_pool(*), jobs(*)')
      .eq('interview_invite_token', token)
      .maybeSingle()

    if (mRow) {
      if (mRow.video_urls?.length > 0) { setDone(true); setLoading(false); return }
      if (mRow.interview_token_expires_at && new Date(mRow.interview_token_expires_at) < new Date()) {
        setError(`expired:${new Date(mRow.interview_token_expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`)
        setLoading(false); return
      }
      const candidate = {
        id: mRow.id,
        full_name: mRow.talent_pool?.full_name ?? '',
        candidate_role: mRow.talent_pool?.candidate_role ?? '',
        email: mRow.talent_pool?.email ?? '',
      }
      setData({ candidate, job: mRow.jobs, table: 'job_matches' })
      setLoading(false)
      return
    }

    setError('Invalid or expired interview link.')
    setLoading(false)
  }

  async function handleSave(update) {
    await supabase.functions.invoke('save-interview-recording', {
      body: { token, table: data.table, ...update },
    })
  }

  function handleComplete() {
    setShowInterview(false)
    setDone(true)
  }

  if (loading) {
    return (
      <div style={pageStyle}>
        <span className="spinner" style={{ width: 36, height: 36 }} />
      </div>
    )
  }

  if (error) {
    const isExpired = error.startsWith('expired:')
    const expiryDate = isExpired ? error.replace('expired:', '') : null
    return (
      <div style={pageStyle}>
        <div style={{ textAlign: 'center', maxWidth: 440, padding: '0 24px' }}>
          <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.3 }}>{isExpired ? '⏱' : '◈'}</div>
          <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 300, marginBottom: 8 }}>
            {isExpired ? 'This link has expired' : 'Link not found'}
          </h2>
          <p style={{ color: 'var(--text-3)', fontSize: 14, lineHeight: 1.7 }}>
            {isExpired
              ? <>This interview link expired on <strong>{expiryDate}</strong>. Please contact your recruiter to request a new invitation link.</>
              : 'This interview link is invalid. Please check the link in your email or contact your recruiter.'}
          </p>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div style={pageStyle}>
        <div style={{ textAlign: 'center', maxWidth: 480, padding: '0 24px' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', border: '2px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 26, color: 'var(--green)' }}>✓</div>
          <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 300, marginBottom: 8 }}>Interview submitted</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 14, lineHeight: 1.7 }}>
            Your responses have been recorded. Our team will review them and be in touch soon.
          </p>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 24 }}>You may close this window.</p>
        </div>
      </div>
    )
  }

  if (showInterview) {
    return (
      <VideoInterview
        job={data.job}
        candidate={data.candidate}
        matchId={data.candidate.id}
        isFromPool={data.table === 'job_matches'}
        onSave={handleSave}
        onClose={() => setShowInterview(false)}
        onComplete={handleComplete}
      />
    )
  }

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 520, width: '100%', padding: '0 24px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 300, letterSpacing: '0.15em', color: '#B8924A', marginBottom: 6, fontSize: 22 }}>ONE SELECT</h1>
          <p style={{ color: 'var(--text-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.15em' }}>AI Video Interview</p>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '32px 28px' }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)', marginBottom: 6 }}>You're invited to interview for</div>
            <h2 style={{ fontSize: 20, fontWeight: 500, margin: '0 0 4px' }}>{data.job?.title}</h2>
            <p style={{ color: 'var(--text-3)', fontSize: 14, margin: 0 }}>Hi {data.candidate.full_name} — your video interview is ready.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
            {[
              ['5 questions', 'Mix of technical and behavioural — generated for this role'],
              ['90–120 seconds', 'Per question, with a visible countdown timer'],
              ['One take', 'No pausing or re-recording'],
              ['Stay in window', 'Tab switches and focus loss are flagged'],
            ].map(([title, desc]) => (
              <div key={title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#B8924A', marginTop: 6, flexShrink: 0 }} />
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{title}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-3)' }}> — {desc}</span>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => setShowInterview(true)}
            style={{ width: '100%', padding: '14px 0', background: '#B8924A', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase' }}
          >
            Start Interview →
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
