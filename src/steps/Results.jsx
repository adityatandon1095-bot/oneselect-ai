import { useState } from 'react'

const DIMS = [
  ['technicalAbility',    'Technical'],
  ['communication',       'Communication'],
  ['roleFit',             'Role Fit'],
  ['problemSolving',      'Problem Solving'],
  ['experienceRelevance', 'Experience'],
]

function recColor(rec) {
  if (rec === 'Strong Hire') return 'var(--green)'
  if (rec === 'Hire')        return 'var(--accent)'
  if (rec === 'Borderline')  return 'var(--amber)'
  return 'var(--red)'
}

function dimColor(v) {
  return v >= 70 ? 'var(--green)' : v >= 50 ? 'var(--accent)' : 'var(--red)'
}

function ScoreRing({ score, size = 52 }) {
  const r = size / 2 - 5
  const circ = 2 * Math.PI * r
  const fill = (score / 100) * circ
  const color = dimColor(score)
  return (
    <div className="score-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border2)" strokeWidth="4.5" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4.5"
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`} />
      </svg>
      <div className="ring-inner">
        <span className={size > 60 ? 'ring-val-lg' : 'ring-val'}>{score}</span>
      </div>
    </div>
  )
}

export default function Results({ jobDefinition, candidates, onReset }) {
  const interviewed = candidates.filter((c) => c.interview?.scores)
  const sorted      = [...interviewed].sort((a, b) => b.interview.scores.overallScore - a.interview.scores.overallScore)

  const [selectedId,  setSelectedId]  = useState(sorted[0]?.id ?? null)
  const [compareIds,  setCompareIds]  = useState([])
  const [view,        setView]        = useState('list')

  const strongHires = interviewed.filter((c) => c.interview.scores.recommendation === 'Strong Hire').length
  const hires       = interviewed.filter((c) => ['Strong Hire','Hire'].includes(c.interview.scores.recommendation)).length
  const avgScore    = interviewed.length
    ? Math.round(interviewed.reduce((s, c) => s + c.interview.scores.overallScore, 0) / interviewed.length)
    : 0

  const toggleCompare = (id) =>
    setCompareIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < 2
          ? [...prev, id]
          : [prev[1], id]
    )

  const openProfile = (id) => { setSelectedId(id); setView('profile') }

  const selected = sorted.find((c) => c.id === selectedId)
  const cmpA     = sorted.find((c) => c.id === compareIds[0])
  const cmpB     = sorted.find((c) => c.id === compareIds[1])

  return (
    <div className="step-page">
      <div className="step-header">
        <h2>Results Dashboard</h2>
        <p>{jobDefinition.title} · {interviewed.length} candidate{interviewed.length !== 1 ? 's' : ''} evaluated</p>
      </div>

      {/* ── Metrics ── */}
      <div className="metrics-row">
        <div className="metric-card">
          <span className="metric-val">{interviewed.length}</span>
          <span className="metric-label">Evaluated</span>
        </div>
        <div className="metric-card green">
          <span className="metric-val">{strongHires}</span>
          <span className="metric-label">Strong Hire</span>
        </div>
        <div className="metric-card blue">
          <span className="metric-val">{hires}</span>
          <span className="metric-label">Hire+</span>
        </div>
        <div className="metric-card">
          <span className="metric-val">{avgScore}</span>
          <span className="metric-label">Avg Score</span>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="view-tabs">
        <button className={`tab${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')}>
          Ranked List
        </button>
        {selected && (
          <button className={`tab${view === 'profile' ? ' active' : ''}`} onClick={() => setView('profile')}>
            Profile
          </button>
        )}
        {compareIds.length === 2 && (
          <button className={`tab${view === 'compare' ? ' active' : ''}`} onClick={() => setView('compare')}>
            Compare
          </button>
        )}
      </div>

      {/* ── List ── */}
      {view === 'list' && (
        <div className="results-list">
          {sorted.map((c, i) => {
            const s = c.interview.scores
            return (
              <div key={c.id} className="result-row" onClick={() => openProfile(c.id)}>
                <div className="result-rank">#{i + 1}</div>
                <div className="result-info">
                  <div className="result-name">{c.parsed.name}</div>
                  <div className="result-meta">{c.parsed.currentRole} · {c.parsed.totalYears}y</div>
                  <div className="result-rec" style={{ color: recColor(s.recommendation) }}>
                    {s.recommendation}
                  </div>
                </div>
                <div className="result-mini-bars">
                  {DIMS.map(([key]) => (
                    <div key={key} className="mini-bar-track">
                      <div className="mini-bar-fill" style={{ width: `${s[key]}%`, background: dimColor(s[key]) }} />
                    </div>
                  ))}
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <ScoreRing score={s.overallScore} size={52} />
                </div>
                <div onClick={(e) => { e.stopPropagation(); toggleCompare(c.id) }}>
                  <input
                    type="checkbox"
                    className="compare-check"
                    title="Add to comparison"
                    checked={compareIds.includes(c.id)}
                    onChange={() => {}}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Profile ── */}
      {view === 'profile' && selected && (
        <ProfileView candidate={selected} recColor={recColor} dimColor={dimColor} />
      )}

      {/* ── Compare ── */}
      {view === 'compare' && cmpA && cmpB && (
        <CompareView a={cmpA} b={cmpB} recColor={recColor} dimColor={dimColor} />
      )}

      <div className="step-footer">
        <button className="btn btn-secondary" onClick={onReset}>↩ Start New Search</button>
        {compareIds.length === 2 && view !== 'compare' && (
          <button className="btn btn-primary" onClick={() => setView('compare')}>
            Compare {compareIds.length === 2 ? sorted.find(c=>c.id===compareIds[0])?.parsed.name?.split(' ')[0] : ''} vs {sorted.find(c=>c.id===compareIds[1])?.parsed.name?.split(' ')[0]} →
          </button>
        )}
      </div>
    </div>
  )
}

function ProfileView({ candidate, recColor, dimColor }) {
  const s   = candidate.interview.scores
  const p   = candidate.parsed
  const rec = s.recommendation

  return (
    <>
      <div className="profile-header">
        <div className="avatar">{p.name[0]}</div>
        <div className="profile-identity">
          <h3>{p.name}</h3>
          <p>{p.currentRole} · {p.totalYears} years exp</p>
          {p.email && <p className="email">{p.email}</p>}
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'center' }}>
          <ScoreRing score={s.overallScore} size={80} />
          <div style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: recColor(rec) }}>
            {rec}
          </div>
        </div>
      </div>

      <div className="profile-grid">
        <div className="profile-section">
          <h4>Dimension Scores</h4>
          {DIMS.map(([key, label]) => (
            <div key={key} className="score-dim">
              <span className="dim-label">{label}</span>
              <div className="dim-track">
                <div className="dim-fill" style={{ width: `${s[key]}%`, background: dimColor(s[key]) }} />
              </div>
              <span className="dim-val">{s[key]}</span>
            </div>
          ))}
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-3)' }}>
            Confidence: <span className="mono" style={{ color: 'var(--text-2)' }}>{s.confidence}%</span>
          </div>
        </div>

        <div className="profile-section">
          <h4>AI Insight</h4>
          <p className="insight-text">{s.insight}</p>

          <h4 style={{ marginTop: 20 }}>Strengths</h4>
          <ul className="strength-list">
            {s.strengths.map((str, i) => (
              <li key={i}><span className="dot-green" />{str}</li>
            ))}
          </ul>

          {s.flags?.length > 0 && (
            <>
              <h4 style={{ marginTop: 20 }}>Red Flags</h4>
              <ul className="flag-list">
                {s.flags.map((f, i) => (
                  <li key={i}><span className="dot-red" />{f}</li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="profile-section full">
          <h4>Best Answer</h4>
          <blockquote className="best-answer">{s.bestAnswer}</blockquote>
        </div>
      </div>
    </>
  )
}

function CompareView({ a, b, recColor, dimColor }) {
  const sa = a.interview.scores
  const sb = b.interview.scores

  return (
    <>
      <div className="compare-header">
        <div className="compare-candidate">
          <div className="avatar">{a.parsed.name[0]}</div>
          <div>
            <h3>{a.parsed.name}</h3>
            <p style={{ fontSize: 12 }}>{a.parsed.currentRole}</p>
          </div>
        </div>
        <div className="compare-vs">VS</div>
        <div className="compare-candidate">
          <div className="avatar">{b.parsed.name[0]}</div>
          <div style={{ textAlign: 'right' }}>
            <h3>{b.parsed.name}</h3>
            <p style={{ fontSize: 12 }}>{b.parsed.currentRole}</p>
          </div>
        </div>
      </div>

      {DIMS.map(([key, label]) => {
        const va = sa[key], vb = sb[key]
        return (
          <div key={key} className="compare-dim-row">
            <div className="compare-a">
              <span className="compare-num">{va}</span>
              <div className="compare-track">
                <div className="compare-fill" style={{ width: `${va}%`, background: dimColor(va) }} />
              </div>
            </div>
            <div className="compare-dim-label">{label}</div>
            <div className="compare-b">
              <div className="compare-track">
                <div className="compare-fill" style={{ width: `${vb}%`, background: dimColor(vb) }} />
              </div>
              <span className="compare-num">{vb}</span>
            </div>
          </div>
        )
      })}

      <div className="compare-overall">
        <div>
          <span style={{ color: recColor(sa.recommendation), fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {sa.recommendation}
          </span>
          <span style={{ marginLeft: 8, fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>
            {sa.overallScore}
          </span>
        </div>
        <div className="compare-dim-label" style={{ margin: '0 auto' }}>Overall</div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginRight: 8 }}>
            {sb.overallScore}
          </span>
          <span style={{ color: recColor(sb.recommendation), fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {sb.recommendation}
          </span>
        </div>
      </div>
    </>
  )
}
