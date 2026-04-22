import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'

const REC_COLOR = { 'Strong Hire': 'var(--green)', 'Hire': 'var(--accent)', 'Borderline': 'var(--amber)', 'Reject': 'var(--red)' }
const DIMS = [
  ['technicalAbility','Technical Ability'],
  ['communication','Communication'],
  ['roleFit','Role Fit'],
  ['problemSolving','Problem Solving'],
  ['experienceRelevance','Experience Relevance'],
]
const INTERVIEW_COMPLETE = 'INTERVIEW_COMPLETE'
const TABS = ['All', 'Interview Pending', 'Interview Done', 'Screened Out']

function dimColor(v) { return v >= 70 ? 'var(--green)' : v >= 50 ? 'var(--accent)' : 'var(--red)' }

function ScoreRing({ score, size = 72 }) {
  const r = size / 2 - 6, circ = 2 * Math.PI * r, fill = (score / 100) * circ, color = dimColor(score)
  return (
    <div className="score-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border2)" strokeWidth="5"/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}/>
      </svg>
      <div className="ring-inner"><span className="ring-val-lg">{score}</span></div>
    </div>
  )
}

function VideoModal({ candidate, onClose }) {
  const [activeIdx, setActiveIdx] = useState(0)
  const videoRef = useRef(null)
  const { full_name, video_urls = [], scores, interview_transcript = [] } = candidate
  const s = scores ?? {}
  const rec = s.recommendation
  const mono = { fontFamily: 'var(--font-mono)' }

  useEffect(() => {
    if (videoRef.current && video_urls[activeIdx]?.url) {
      videoRef.current.load()
      videoRef.current.play().catch(() => {})
    }
  }, [activeIdx])

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#F8F7F4', width: '100%', maxWidth: 860, maxHeight: '90vh', overflow: 'auto', display: 'flex', flexDirection: 'column', border: '1px solid #E8E4DC' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 28px', borderBottom: '1px solid #E8E4DC', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 10, ...mono, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9CA3AF', marginBottom: 4 }}>Video Interview</div>
            <div style={{ fontSize: 18, fontFamily: 'Georgia, serif', fontWeight: 400, color: '#2D3748' }}>{full_name}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {s.overallScore != null && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: REC_COLOR[rec] ?? '#B8924A' }}>{s.overallScore}</div>
                {rec && <div style={{ fontSize: 11, ...mono, textTransform: 'uppercase', letterSpacing: '0.05em', color: REC_COLOR[rec] ?? '#9CA3AF' }}>{rec}</div>}
              </div>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#9CA3AF', padding: '4px 8px', lineHeight: 1 }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Video player */}
          <div>
            <div style={{ background: '#000', overflow: 'hidden', aspectRatio: '16/9' }}>
              {video_urls[activeIdx]?.url
                ? <video ref={videoRef} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} src={video_urls[activeIdx].url} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>No recording for this question</div>
              }
            </div>
            {video_urls[activeIdx]?.q && (
              <div style={{ padding: '10px 14px', background: 'white', border: '1px solid #E8E4DC', borderLeft: '3px solid #B8924A', marginTop: 10 }}>
                <div style={{ fontSize: 10, ...mono, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9CA3AF', marginBottom: 4 }}>Question {activeIdx + 1}</div>
                <div style={{ fontSize: 13, color: '#4A5568', lineHeight: 1.6 }}>{video_urls[activeIdx].q}</div>
              </div>
            )}
            {video_urls.length > 1 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                {video_urls.map((v, i) => (
                  <button key={i} onClick={() => setActiveIdx(i)} style={{
                    padding: '5px 14px', border: `1px solid ${i === activeIdx ? '#B8924A' : '#E8E4DC'}`,
                    background: i === activeIdx ? 'rgba(184,146,74,0.08)' : 'white',
                    color: i === activeIdx ? '#B8924A' : '#9CA3AF',
                    cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-mono)',
                  }}>
                    Q{i + 1}{!v.url ? ' ⚠' : ''}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* AI score dimensions */}
          {s.overallScore != null && (
            <div style={{ background: 'white', border: '1px solid #E8E4DC', padding: '20px 24px' }}>
              <div style={{ fontSize: 10, ...mono, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9CA3AF', marginBottom: 16 }}>AI Assessment</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, marginBottom: s.insight ? 16 : 0 }}>
                {DIMS.map(([key, label]) => (
                  <div key={key}>
                    <div style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'var(--font-mono)', marginBottom: 5 }}>{label}</div>
                    <div style={{ height: 3, background: '#E8E4DC', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${s[key] ?? 0}%`, background: dimColor(s[key] ?? 0), transition: 'width 0.4s' }} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: dimColor(s[key] ?? 0), marginTop: 4 }}>{s[key] ?? '—'}</div>
                  </div>
                ))}
              </div>
              {s.insight && (
                <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.7, margin: 0, paddingTop: 16, borderTop: '1px solid #E8E4DC', fontStyle: 'italic' }}>
                  {s.insight}
                </p>
              )}
            </div>
          )}

          {/* Transcript */}
          {interview_transcript.length > 0 && (
            <div style={{ background: 'white', border: '1px solid #E8E4DC', padding: '20px 24px' }}>
              <div style={{ fontSize: 10, ...mono, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9CA3AF', marginBottom: 16 }}>Interview Transcript</div>
              <div className="transcript-wrap">
                {interview_transcript.map((msg, i) => (
                  <div key={i} className={`bubble ${msg.role}`}>
                    <div className="bubble-who">{msg.role === 'assistant' ? 'Interviewer' : 'Candidate'}</div>
                    <div className="bubble-body">{msg.content?.replace(INTERVIEW_COMPLETE, '').trim()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CandidateProfile({ candidate, onBack, onWatch }) {
  const s = candidate.scores ?? {}
  const transcript = candidate.interview_transcript ?? []
  const rec = s.recommendation
  const hasVideo = candidate.video_urls?.length > 0

  return (
    <div>
      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className="btn btn-secondary" onClick={onBack}>← Back to list</button>
        {hasVideo && (
          <button
            className="btn btn-primary"
            onClick={onWatch}
            style={{ background: '#B8924A', borderColor: '#B8924A' }}
          >
            ▶ Watch Interview
          </button>
        )}
      </div>

      <div className="profile-hero">
        <div className="profile-avatar">{(candidate.full_name ?? '?')[0].toUpperCase()}</div>
        <div className="profile-id" style={{ flex: 1 }}>
          <h3>{candidate.full_name}</h3>
          <p>{candidate.candidate_role} · {candidate.total_years}y exp</p>
          {candidate.match_score != null && (
            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span className={`badge ${candidate.match_pass ? 'badge-green' : 'badge-red'}`}>
                Screen {candidate.match_score}/100
              </span>
            </div>
          )}
        </div>
        {s.overallScore != null && (
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <ScoreRing score={s.overallScore} size={72} />
            {rec && (
              <div style={{ marginTop: 6, fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em', color: REC_COLOR[rec] ?? 'var(--text-3)' }}>
                {rec}
              </div>
            )}
          </div>
        )}
      </div>

      {candidate.match_reason && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `2px solid ${candidate.match_pass ? 'var(--green)' : 'var(--red)'}`, fontSize: 13, color: 'var(--text-2)', fontWeight: 300 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Screening verdict</span>
          {candidate.match_reason}
        </div>
      )}

      {s.overallScore == null && candidate.match_pass && (
        <div style={{ padding: '32px 24px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-3)', marginBottom: 8 }}>Interview Status</div>
          <div style={{ fontSize: 15, color: 'var(--amber)', fontFamily: 'var(--font-mono)' }}>
            {hasVideo ? 'Video Submitted — Awaiting Score' : 'Interview Pending'}
          </div>
          {!hasVideo && <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6, fontWeight: 300 }}>This candidate passed screening and has been invited to complete their video interview.</div>}
        </div>
      )}

      {s.overallScore != null && (
        <div className="profile-grid">
          <div className="profile-section">
            <h4>Dimension Scores</h4>
            {DIMS.map(([key, label]) => (
              <div key={key} className="score-dim">
                <span className="dim-label">{label}</span>
                <div className="dim-track"><div className="dim-fill" style={{ width: `${s[key] ?? 0}%`, background: dimColor(s[key] ?? 0) }} /></div>
                <span className="dim-val">{s[key] ?? '—'}</span>
              </div>
            ))}
          </div>

          <div className="profile-section">
            {s.insight && (
              <>
                <h4>AI Insight</h4>
                <p className="insight-text">{s.insight}</p>
              </>
            )}
            {s.strengths?.length > 0 && (
              <>
                <h4 style={{ marginTop: 16 }}>Strengths</h4>
                <ul className="strength-list">
                  {s.strengths.map((str, i) => <li key={i}><span className="dot-green" />{str}</li>)}
                </ul>
              </>
            )}
            {s.flags?.length > 0 && (
              <>
                <h4 style={{ marginTop: 16 }}>Red Flags</h4>
                <ul className="flag-list">
                  {s.flags.map((f, i) => <li key={i}><span className="dot-red" />{f}</li>)}
                </ul>
              </>
            )}
          </div>

          {s.bestAnswer && (
            <div className="profile-section full">
              <h4>Best Answer</h4>
              <blockquote className="best-answer">{s.bestAnswer}</blockquote>
            </div>
          )}

          {transcript.length > 0 && (
            <div className="profile-section full">
              <h4>Interview Transcript</h4>
              <div className="transcript-wrap">
                {transcript.map((msg, i) => (
                  <div key={i} className={`bubble ${msg.role}`}>
                    <div className="bubble-who">{msg.role === 'assistant' ? 'Interviewer' : 'Candidate'}</div>
                    <div className="bubble-body">{msg.content.replace(INTERVIEW_COMPLETE, '').trim()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ClientCandidates() {
  const { user } = useAuth()
  const location = useLocation()
  const [jobs, setJobs] = useState([])
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [jobFilter, setJobFilter] = useState('all')
  const [tab, setTab] = useState('All')
  const [selectedId, setSelectedId] = useState(null)
  const [watchId, setWatchId] = useState(null)

  useEffect(() => { if (user) load() }, [user])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const t = params.get('tab')
    if (t && TABS.includes(t)) setTab(t)
  }, [location.search])

  async function load() {
    const { data: jobData } = await supabase.from('jobs').select('id, title').eq('recruiter_id', user.id)
    const ids = (jobData ?? []).map(j => j.id)
    setJobs(jobData ?? [])
    if (!ids.length) { setLoading(false); return }

    const { data: cData } = await supabase
      .from('candidates')
      .select('*')
      .in('job_id', ids)
      .order('match_score', { ascending: false, nullsFirst: false })

    setCandidates(cData ?? [])
    setLoading(false)
  }

  function getStatus(c) {
    if (c.scores) return 'Interview Done'
    if (c.match_pass === true) return 'Interview Pending'
    if (c.match_pass === false) return 'Screened Out'
    return 'Pending'
  }

  const byJob = jobFilter === 'all' ? candidates : candidates.filter(c => c.job_id === jobFilter)

  const tabFiltered = byJob.filter(c => {
    if (tab === 'All') return true
    return getStatus(c) === tab
  })

  const counts = {
    'All': byJob.length,
    'Interview Pending': byJob.filter(c => getStatus(c) === 'Interview Pending').length,
    'Interview Done': byJob.filter(c => getStatus(c) === 'Interview Done').length,
    'Screened Out': byJob.filter(c => getStatus(c) === 'Screened Out').length,
  }

  const selected  = candidates.find(c => c.id === selectedId)
  const watching  = candidates.find(c => c.id === watchId)

  if (loading) return <div className="page"><span className="spinner" /></div>

  if (selected) {
    return (
      <div className="page">
        <CandidateProfile
          candidate={selected}
          onBack={() => setSelectedId(null)}
          onWatch={() => setWatchId(selected.id)}
        />
        {watching && <VideoModal candidate={watching} onClose={() => setWatchId(null)} />}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Candidates</h2>
          <p>{byJob.length} candidate{byJob.length !== 1 ? 's' : ''} total</p>
        </div>
        <select value={jobFilter} onChange={e => setJobFilter(e.target.value)} style={{ width: 200 }}>
          <option value="all">All Jobs</option>
          {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: tab === t ? 'var(--accent)' : 'var(--text-3)',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1, transition: 'color 0.12s',
            }}
          >
            {t}
            {counts[t] != null && (
              <span style={{ marginLeft: 6, fontFamily: 'var(--font-mono)', fontSize: 10, color: tab === t ? 'var(--accent)' : 'var(--text-3)' }}>
                {counts[t]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="section-card">
        {tabFiltered.length === 0 ? (
          <div className="empty-state">No candidates in this category</div>
        ) : (
          tabFiltered.map(c => {
            const s = c.scores
            const rec = s?.recommendation
            const status = getStatus(c)
            const hasVideo = c.video_urls?.length > 0
            return (
              <div key={c.id} className="table-row clickable" onClick={() => setSelectedId(c.id)}>
                <div className="col-main">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="profile-avatar" style={{ width: 34, height: 34, fontSize: 14, borderRadius: 'var(--r)', flexShrink: 0 }}>
                      {(c.full_name ?? '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="col-name">{c.full_name}</div>
                      <div className="col-sub">{c.candidate_role} · {c.total_years}y exp</div>
                    </div>
                  </div>
                </div>
                <div className="col-right">
                  {c.match_score != null && (
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      Screen {c.match_score}
                    </span>
                  )}
                  {s?.overallScore != null && (
                    <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: dimColor(s.overallScore) }}>
                      {s.overallScore}
                    </span>
                  )}
                  {rec && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: REC_COLOR[rec], fontFamily: 'var(--font-mono)' }}>
                      {rec}
                    </span>
                  )}
                  {hasVideo && (
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 11, padding: '4px 10px', color: '#B8924A', borderColor: '#B8924A' }}
                      onClick={e => { e.stopPropagation(); setWatchId(c.id) }}
                    >
                      ▶ Watch
                    </button>
                  )}
                  {status === 'Interview Pending'  && !hasVideo && <span className="badge badge-amber">Interview Pending</span>}
                  {status === 'Screened Out'       && !s && <span className="badge badge-red">Screened Out</span>}
                  {status === 'Pending'            && <span className="badge" style={{ color: 'var(--text-3)', background: 'var(--surface2)' }}>Pending</span>}
                </div>
              </div>
            )
          })
        )}
      </div>

      {watching && <VideoModal candidate={watching} onClose={() => setWatchId(null)} />}
    </div>
  )
}
