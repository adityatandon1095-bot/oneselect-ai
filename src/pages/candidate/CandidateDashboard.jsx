import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'

// Map raw DB state → candidate-friendly label + colour
function getStage(app) {
  if (app.recommendation === 'Strong Hire' || app.recommendation === 'Hire') {
    return { label: 'Shortlisted', color: 'var(--green)', dot: '#22c55e' }
  }
  if (app.interview_scores && Object.keys(app.interview_scores).length > 0) {
    return { label: 'Under Review', color: 'var(--amber)', dot: '#f59e0b' }
  }
  if (app.video_urls && app.video_urls.length > 0) {
    return { label: 'Interview Submitted', color: 'var(--accent)', dot: '#6366f1' }
  }
  if (app.match_pass === true) {
    return { label: 'Interview Requested', color: 'var(--amber)', dot: '#f59e0b', cta: true }
  }
  return { label: 'Application Received', color: 'var(--text-3)', dot: '#6b7280' }
}

function StageBar({ stage }) {
  const steps = ['Application Received', 'Interview Requested', 'Interview Submitted', 'Under Review', 'Shortlisted']
  const idx = steps.indexOf(stage.label)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 12 }}>
      {steps.map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
            background: i <= idx ? stage.dot : 'var(--border2)',
            border: i === idx ? `2px solid ${stage.dot}` : 'none',
            boxShadow: i === idx ? `0 0 0 3px ${stage.dot}22` : 'none',
          }} />
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 2, background: i < idx ? stage.dot : 'var(--border2)', margin: '0 2px' }} />
          )}
        </div>
      ))}
    </div>
  )
}

function AppCard({ app, onInterview }) {
  const stage = getStage(app)
  const mono = { fontFamily: 'var(--font-mono)' }

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '20px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
    }}>
      {/* Top row: title + stage badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
            {app.job_title}
          </div>
          {app.source === 'pool' && (
            <div style={{ fontSize: 11, ...mono, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Talent Pool Match
            </div>
          )}
        </div>
        <div style={{
          fontSize: 11, ...mono, textTransform: 'uppercase', letterSpacing: '0.08em',
          color: stage.color, background: `${stage.dot}18`,
          border: `1px solid ${stage.dot}33`,
          borderRadius: 20, padding: '4px 10px', whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {stage.label}
        </div>
      </div>

      {/* Stage progress bar */}
      <StageBar stage={stage} />

      {/* CTA for interview */}
      {stage.cta && (
        <div style={{ marginTop: 16, padding: '14px 16px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, marginBottom: 2 }}>Video interview ready</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Complete your recorded interview to move forward.</div>
          </div>
          <button
            className="btn btn-primary"
            style={{ fontSize: 12, padding: '8px 18px', flexShrink: 0 }}
            onClick={() => onInterview(app)}
          >
            Start Interview →
          </button>
        </div>
      )}

      {/* Interview submitted confirmation */}
      {app.video_urls?.length > 0 && !stage.cta && (
        <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--green)' }}>✓</span>
          Video interview submitted — our team will review and get back to you.
        </div>
      )}
    </div>
  )
}

export default function CandidateDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [apps, setApps] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (user?.email) load()
  }, [user?.email])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const email = user.email

      // 1. CV-uploaded candidates matched to jobs
      const { data: cvCandidates, error: cvErr } = await supabase
        .from('candidates')
        .select('id, full_name, job_id, match_pass, match_score, video_urls, integrity_score, integrity_flags, interview_scores, recommendation, jobs(id, title)')
        .eq('email', email)

      if (cvErr) throw cvErr

      // 2. Talent pool job_matches
      const { data: poolRecord, error: poolErr } = await supabase
        .from('talent_pool')
        .select('id, job_matches(id, job_id, match_pass, match_score, video_urls, integrity_score, integrity_flags, interview_scores, recommendation, jobs(id, title))')
        .eq('email', email)
        .maybeSingle()

      if (poolErr) throw poolErr

      const combined = []

      // CV candidates
      for (const c of cvCandidates ?? []) {
        combined.push({
          id: c.id,
          source: 'cv',
          matchId: c.id,
          job_title: c.jobs?.title ?? 'Role',
          match_pass: c.match_pass,
          match_score: c.match_score,
          video_urls: c.video_urls,
          integrity_score: c.integrity_score,
          integrity_flags: c.integrity_flags,
          interview_scores: c.interview_scores,
          recommendation: c.recommendation,
          job_id: c.job_id,
        })
      }

      // Pool matches
      for (const m of poolRecord?.job_matches ?? []) {
        // Deduplicate: skip if same job already added via CV
        if (combined.some(a => a.job_id === m.job_id)) continue
        combined.push({
          id: m.id,
          source: 'pool',
          matchId: m.id,
          job_title: m.jobs?.title ?? 'Role',
          match_pass: m.match_pass,
          match_score: m.match_score,
          video_urls: m.video_urls,
          integrity_score: m.integrity_score,
          integrity_flags: m.integrity_flags,
          interview_scores: m.interview_scores,
          recommendation: m.recommendation,
          job_id: m.job_id,
        })
      }

      setApps(combined)
    } catch (e) {
      console.error(e)
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleInterview(app) {
    navigate(`/candidate/interview/${app.source}/${app.matchId}`)
  }

  const mono = { fontFamily: 'var(--font-mono)' }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
      <span className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', margin: '0 0 6px' }}>My Applications</h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
          Track your progress across all roles One Select is placing you for.
        </p>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {apps.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>◈</div>
          <div style={{ fontSize: 15, color: 'var(--text)', marginBottom: 8 }}>No applications yet</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
            When One Select adds you to a role, it will appear here.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {apps.map(app => (
          <AppCard key={`${app.source}-${app.id}`} app={app} onInterview={handleInterview} />
        ))}
      </div>
    </div>
  )
}
