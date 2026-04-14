import { useState } from 'react'
import { callClaude } from '../utils/api'

const RANK_BADGE = { top10: 'badge-blue', strong: 'badge-green', moderate: 'badge-amber', weak: 'badge-red' }

function buildSystem(jd) {
  return `You are an expert recruiter evaluating a candidate against a job posting.

Job Title: ${jd.title}
Experience Required: ${jd.yearsOfExperience}+ years
Required Skills: ${jd.requiredSkills.join(', ')}
Preferred Skills: ${jd.preferredSkills.length ? jd.preferredSkills.join(', ') : 'none specified'}
Role Description: ${jd.description}
Evaluation Weighting: ${jd.technicalWeight}% technical, ${jd.communicationWeight}% communication/soft skills

Evaluate the candidate and return ONLY a valid JSON object — no markdown, no explanation:
{
  "matchScore": number 0-100,
  "pass": boolean (true when matchScore >= 60),
  "reason": "2-3 sentence explanation",
  "rank": "top10" | "strong" | "moderate" | "weak"
}`
}

function candidateMessage(c) {
  const p = c.parsed
  return `Candidate CV:
Name: ${p.name}
Current Role: ${p.currentRole}
Total Experience: ${p.totalYears} years
Skills: ${p.skills.join(', ')}
Education: ${p.education}
Summary: ${p.summary}
Highlights:
${p.highlights.map((h) => `- ${h}`).join('\n')}`
}

function ScoreRing({ score }) {
  const r = 22
  const circ = 2 * Math.PI * r
  const fill = (score / 100) * circ
  const color = score >= 70 ? 'var(--green)' : score >= 50 ? 'var(--accent)' : 'var(--amber)'
  return (
    <div className="score-ring">
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--border2)" strokeWidth="4" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 26 26)" />
      </svg>
      <div className="ring-inner">
        <span className="ring-val">{score}</span>
      </div>
    </div>
  )
}

export default function Screening({ jobDefinition, candidates, onNext }) {
  const [rows, setRows] = useState(candidates.map((c) => ({ ...c, _status: 'pending' })))
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)

  const patch = (id, updates) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)))

  const runScreening = async () => {
    setRunning(true)
    const system = buildSystem(jobDefinition)
    for (const c of rows) {
      patch(c.id, { _status: 'running' })
      try {
        const text = await callClaude([{ role: 'user', content: candidateMessage(c) }], system, 512)
        const screening = JSON.parse(text.trim())
        patch(c.id, { _status: 'done', screening })
      } catch (err) {
        patch(c.id, {
          _status: 'done',
          screening: { matchScore: 0, pass: false, reason: err.message, rank: 'weak' },
        })
      }
    }
    setRunning(false)
    setFinished(true)
  }

  const sorted = [...rows].sort((a, b) => {
    const sa = a.screening?.matchScore ?? -1
    const sb = b.screening?.matchScore ?? -1
    return sb - sa
  })

  const doneCount  = rows.filter((r) => r._status === 'done').length
  const passCount  = rows.filter((r) => r.screening?.pass).length
  const progress   = rows.length ? (doneCount / rows.length) * 100 : 0

  return (
    <div className="step-page">
      <div className="step-header">
        <h2>AI Screening</h2>
        <p>Claude evaluates each candidate against your job definition and assigns a match score.</p>
      </div>

      {!running && !finished && (
        <div className="action-card">
          <p>{rows.length} candidate{rows.length !== 1 ? 's' : ''} ready to screen</p>
          <button className="btn btn-primary" onClick={runScreening}>Run AI Screening</button>
        </div>
      )}

      {(running || finished) && (
        <>
          {running && (
            <div className="progress-section">
              <div className="progress-track" style={{ flex: 1 }}>
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="mono text-muted" style={{ fontSize: 11, flexShrink: 0 }}>
                {doneCount}/{rows.length}
              </span>
            </div>
          )}

          {finished && (
            <div className="screening-summary">
              <div className="summary-stat">
                <span className="stat-num">{rows.length}</span>
                <span className="stat-label">Screened</span>
              </div>
              <div className="summary-stat green">
                <span className="stat-num">{passCount}</span>
                <span className="stat-label">Passed</span>
              </div>
              <div className="summary-stat red">
                <span className="stat-num">{rows.length - passCount}</span>
                <span className="stat-label">Rejected</span>
              </div>
            </div>
          )}

          <div className="candidate-list">
            {sorted.map((c, i) => (
              <div key={c.id} className={`candidate-row${c.screening && !c.screening.pass ? ' dimmed' : ''}`}>
                <div className="candidate-rank">#{i + 1}</div>
                <div className="candidate-info">
                  <div className="candidate-name">{c.parsed.name}</div>
                  <div className="candidate-meta">{c.parsed.currentRole} · {c.parsed.totalYears}y exp</div>
                  {c.screening?.reason && (
                    <div className="candidate-reason">{c.screening.reason}</div>
                  )}
                </div>
                <div className="candidate-score">
                  {c._status === 'running' && <span className="spinner" />}
                  {c.screening && (
                    <>
                      <ScoreRing score={c.screening.matchScore} />
                      <span className={`badge ${RANK_BADGE[c.screening.rank] ?? 'badge-amber'}`}>
                        {c.screening.rank}
                      </span>
                      <span className={`badge ${c.screening.pass ? 'badge-green' : 'badge-red'}`}>
                        {c.screening.pass ? 'Pass' : 'Fail'}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="step-footer">
        <button
          className="btn btn-primary"
          disabled={!finished || passCount === 0}
          onClick={() => onNext(rows)}
        >
          Continue to Interviews ({passCount} passed) →
        </button>
        {finished && passCount === 0 && (
          <span className="text-muted" style={{ fontSize: 12 }}>No candidates passed screening</span>
        )}
      </div>
    </div>
  )
}
