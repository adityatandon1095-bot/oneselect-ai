import { useState, useEffect, useRef } from 'react'
import { callClaude } from '../utils/api'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// ── Status messages shown while AI works ──────────────────────────────────────
const STATUS_MSGS = [
  'Analyzing role requirements…',
  'Benchmarking market compensation…',
  'Generating job description…',
  'Building skills matrix…',
  'Scanning talent pool…',
  'Almost ready…',
]

const EXAMPLE_BRIEFS = [
  'Senior Java developer with Spring Boot',
  'React frontend engineer for a fintech product',
  'Python ML engineer with NLP experience',
  'DevOps engineer with Kubernetes and AWS',
  'Product Manager for a B2B SaaS platform',
]

// ── Build the mega-prompt ──────────────────────────────────────────────────────
function buildSystemPrompt(profile) {
  return `You are a world-class technical recruiter at a top executive search firm.
Client company: ${profile?.company_name || 'a technology company'}
Industry context: ${profile?.industry || 'Technology'}
Primary market: India

Your task: generate a complete, production-ready job requisition from the hiring brief.
Be expert, precise, and market-accurate. Use real skill names and realistic compensation.

Return ONLY valid JSON — no markdown, no explanation:
{
  "title": "precise, market-standard job title",
  "experience_years": <integer — infer from seniority in brief, default 3>,
  "required_skills": ["skill1","skill2",...],
  "preferred_skills": ["skill1","skill2",...],
  "description": "full JD in plain text. Use these sections separated by a blank line: About the Role | Key Responsibilities | Required Qualifications | Preferred Qualifications | What We Offer",
  "tech_weight": <integer 60-80 for engineering, 50-60 for hybrid>,
  "comm_weight": <integer, must sum to 100 with tech_weight>,
  "comp_min": <integer LPA — realistic India market minimum>,
  "comp_max": <integer LPA — realistic India market maximum>,
  "work_mode": "WFO|WFH|Hybrid",
  "interview_focus": ["area1","area2","area3"],
  "insights": {
    "time_to_fill_weeks": <integer>,
    "market_demand": "high|medium|low",
    "salary_competitiveness": "above_market|at_market|below_market",
    "hiring_tip": "one specific, actionable sentence for this exact role and market"
  }
}`
}

// ── Local talent scoring (no extra AI call) ───────────────────────────────────
function scoreCandidate(candidate, requiredSkills) {
  if (!requiredSkills?.length) return 0
  const cSkills = (candidate.skills ?? []).map(s => s.toLowerCase())
  const matches = requiredSkills.filter(rs => {
    const r = rs.toLowerCase()
    return cSkills.some(cs => cs.includes(r) || r.includes(cs))
  })
  return matches.length / requiredSkills.length
}

// ── UI helpers ────────────────────────────────────────────────────────────────
const DEMAND_STYLE = {
  high:   { color: 'var(--green)',  label: 'High demand' },
  medium: { color: 'var(--accent)', label: 'Moderate demand' },
  low:    { color: 'var(--amber)',  label: 'Low demand' },
}
const SALARY_STYLE = {
  above_market: { color: 'var(--green)',  label: 'Above market' },
  at_market:    { color: 'var(--accent)', label: 'At market rate' },
  below_market: { color: 'var(--amber)',  label: 'Below market' },
}

function Tag({ label, cls = 'badge-blue' }) {
  return <span className={`badge ${cls}`} style={{ marginBottom: 4 }}>{label}</span>
}

// ── Main component ────────────────────────────────────────────────────────────
export default function InstantPost({ onClose, onSave, onCustomize }) {
  const { profile } = useAuth()

  const BRIEF_KEY = 'os_instantpost_brief'
  const [step,       setStep]       = useState('input')
  const [brief,      setBrief]      = useState(() => {
    try { return localStorage.getItem(BRIEF_KEY) ?? '' } catch { return '' }
  })
  const [statusIdx,  setStatusIdx]  = useState(0)
  const [job,        setJob]        = useState(null)
  const [topMatches, setTopMatches] = useState([])
  const [matchCount, setMatchCount] = useState(0)
  const [totalPool,  setTotalPool]  = useState(0)
  const [error,      setError]      = useState('')
  const [posting,    setPosting]    = useState(false)

  const intervalRef = useRef(null)

  // Cycle status messages during generation
  useEffect(() => {
    if (step === 'generating') {
      setStatusIdx(0)
      intervalRef.current = setInterval(() => {
        setStatusIdx(i => Math.min(i + 1, STATUS_MSGS.length - 1))
      }, 1700)
    }
    return () => clearInterval(intervalRef.current)
  }, [step])

  function handleBriefChange(val) {
    setBrief(val)
    try {
      if (val.trim()) localStorage.setItem(BRIEF_KEY, val)
      else localStorage.removeItem(BRIEF_KEY)
    } catch { /* ignore */ }
  }

  async function handleGenerate() {
    if (!brief.trim()) return
    setError('')
    setStep('generating')

    // Fetch talent pool in parallel while AI generates
    const poolPromise = supabase
      .from('talent_pool')
      .select('id, full_name, candidate_role, skills, total_years')
      .eq('availability', 'available')

    let generatedJob = null
    try {
      const reply = await callClaude(
        [{ role: 'user', content: brief }],
        buildSystemPrompt(profile),
        2500,
      )
      const clean = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/```[\s]*$/m, '').trim()
      generatedJob = JSON.parse(clean)
    } catch (e) {
      clearInterval(intervalRef.current)
      setError('Could not generate job posting. Try again.')
      setStep('input')
      return
    }

    // Score talent pool against generated skills
    const { data: candidates } = await poolPromise
    const pool = candidates ?? []
    setTotalPool(pool.length)

    const scored = pool
      .map(c => ({ ...c, _score: scoreCandidate(c, generatedJob.required_skills) }))
      .filter(c => c._score > 0)
      .sort((a, b) => b._score - a._score)

    setJob(generatedJob)
    setTopMatches(scored.slice(0, 3))
    setMatchCount(scored.filter(c => c._score >= 0.35).length)
    clearInterval(intervalRef.current)
    setStep('preview')
  }

  function handlePost() {
    if (!job) return
    try { localStorage.removeItem(BRIEF_KEY) } catch { /* ignore */ }
    setPosting(true)
    onSave({
      title:            job.title,
      description:      job.description,
      required_skills:  job.required_skills  ?? [],
      preferred_skills: job.preferred_skills ?? [],
      experience_years: job.experience_years ?? 3,
      tech_weight:      job.tech_weight      ?? 60,
      comm_weight:      job.comm_weight      ?? 40,
    })
  }

  function handleCustomize() {
    // Pass generated data to the full wizard for fine-tuning
    if (onCustomize && job) onCustomize(job)
    else onClose()
  }

  // ── Shared styles ─────────────────────────────────────────────────────────
  const mono = { fontFamily: 'var(--font-mono)' }
  const muted = { color: 'var(--text-3)', fontSize: 12 }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 700, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 32px 96px rgba(0,0,0,0.5)' }}>

        {/* ── INPUT ── */}
        {step === 'input' && (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <button onClick={onClose} style={{ position: 'absolute', top: 20, right: 24, background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-3)' }}>✕</button>

            <div style={{ fontSize: 28, marginBottom: 8 }}>✨</div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 300, fontSize: 26, margin: '0 0 8px', color: 'var(--text)' }}>
              What role are you hiring for?
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-3)', margin: '0 0 32px', lineHeight: 1.5 }}>
              Type a brief description. AI generates the entire job — skills, JD, compensation, and more — in seconds.
            </p>

            <textarea
              value={brief}
              onChange={e => handleBriefChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate() } }}
              placeholder='e.g. "Senior Java developer with Spring Boot and microservices experience"'
              rows={3}
              autoFocus
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 15, lineHeight: 1.6, resize: 'none', textAlign: 'left' }}
            />

            {error && <div className="error-banner" style={{ marginTop: 12, textAlign: 'left' }}>{error}</div>}

            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '14px', fontSize: 15, marginTop: 16, borderRadius: 8 }}
              onClick={handleGenerate}
              disabled={!brief.trim()}
            >
              Generate Job Posting →
            </button>

            {/* Example prompts */}
            <div style={{ marginTop: 28 }}>
              <div style={{ ...muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em', ...mono }}>Try an example</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                {EXAMPLE_BRIEFS.map(ex => (
                  <button
                    key={ex}
                    onClick={() => setBrief(ex)}
                    style={{ fontSize: 12, padding: '5px 12px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', color: 'var(--text-2)' }}
                  >{ex}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── GENERATING ── */}
        {step === 'generating' && (
          <div style={{ padding: 80, textAlign: 'center' }}>
            <div style={{ position: 'relative', display: 'inline-block', marginBottom: 32 }}>
              <span className="spinner" style={{ width: 48, height: 48, borderWidth: 3 }} />
            </div>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 300, fontSize: 18, color: 'var(--text)', marginBottom: 8 }}>
              {STATUS_MSGS[statusIdx]}
            </div>
            <div style={{ ...muted }}>Building your complete job requisition…</div>
          </div>
        )}

        {/* ── PREVIEW ── */}
        {step === 'preview' && job && (
          <div>
            {/* Header */}
            <div style={{ padding: '28px 32px 20px', borderBottom: '1px solid var(--border2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, ...mono, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)', background: 'rgba(99,102,241,0.1)', padding: '3px 8px', borderRadius: 4 }}>
                      AI Generated
                    </span>
                    <span className="badge badge-amber">{job.work_mode}</span>
                    {job.experience_years && <span style={{ ...muted, ...mono }}>{job.experience_years}+ yrs</span>}
                    {job.comp_min && <span style={{ ...muted, ...mono }}>₹{job.comp_min}–{job.comp_max} LPA</span>}
                  </div>
                  <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 400, fontSize: 22, margin: '0 0 12px', color: 'var(--text)', lineHeight: 1.2 }}>
                    {job.title}
                  </h2>
                  {/* Required skills */}
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {(job.required_skills ?? []).map(s => <Tag key={s} label={s} cls="badge-blue" />)}
                    {(job.preferred_skills ?? []).map(s => <Tag key={s} label={s} cls="badge-amber" />)}
                  </div>
                </div>
                <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-3)', marginLeft: 16, flexShrink: 0, padding: '2px 6px' }}>✕</button>
              </div>
            </div>

            {/* Two-column insight cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderBottom: '1px solid var(--border2)' }}>

              {/* Talent Pool Preview */}
              <div style={{ padding: '20px 24px', borderRight: '1px solid var(--border2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 16 }}>🎯</span>
                  <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--text)' }}>Talent Pool</span>
                </div>
                {totalPool === 0 ? (
                  <div style={{ ...muted }}>No candidates in pool yet.</div>
                ) : matchCount === 0 ? (
                  <div style={{ ...muted }}>No direct matches in pool of {totalPool}.</div>
                ) : (
                  <>
                    <div style={{ fontFamily: 'var(--font-head)', fontSize: 22, fontWeight: 400, color: matchCount > 0 ? 'var(--green)' : 'var(--text-3)', marginBottom: 4 }}>
                      {matchCount}
                      <span style={{ fontSize: 13, fontWeight: 400, ...muted, marginLeft: 4 }}>candidate{matchCount !== 1 ? 's' : ''} match</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                      {topMatches.map(m => (
                        <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{m.full_name}</span>
                            <span style={{ ...muted, marginLeft: 6 }}>{m.candidate_role}</span>
                          </div>
                          <span style={{ ...mono, fontSize: 11, color: 'var(--accent)' }}>
                            {Math.round(m._score * 100)}%
                          </span>
                        </div>
                      ))}
                    </div>
                    <div style={{ ...muted, marginTop: 8 }}>Will be auto-screened on post</div>
                  </>
                )}
              </div>

              {/* Market Insights */}
              <div style={{ padding: '20px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 16 }}>📊</span>
                  <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--text)' }}>Market Insights</span>
                </div>
                {job.insights && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ ...muted }}>Time to fill</span>
                      <span style={{ ...mono, fontSize: 12, color: 'var(--text-2)' }}>~{job.insights.time_to_fill_weeks}w</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ ...muted }}>Talent demand</span>
                      <span style={{ ...mono, fontSize: 12, color: (DEMAND_STYLE[job.insights.market_demand] ?? DEMAND_STYLE.medium).color }}>
                        {(DEMAND_STYLE[job.insights.market_demand] ?? DEMAND_STYLE.medium).label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ ...muted }}>Salary</span>
                      <span style={{ ...mono, fontSize: 12, color: (SALARY_STYLE[job.insights.salary_competitiveness] ?? SALARY_STYLE.at_market).color }}>
                        {(SALARY_STYLE[job.insights.salary_competitiveness] ?? SALARY_STYLE.at_market).label}
                      </span>
                    </div>
                    {job.insights.hiring_tip && (
                      <div style={{ marginTop: 6, padding: '8px 10px', background: 'var(--bg)', borderRadius: 6, borderLeft: '2px solid var(--accent)' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>
                          💡 {job.insights.hiring_tip}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Interview focus */}
            {job.interview_focus?.length > 0 && (
              <div style={{ padding: '14px 32px', borderBottom: '1px solid var(--border2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ ...muted, ...mono, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Interview focus</span>
                {job.interview_focus.map(f => (
                  <span key={f} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-2)' }}>{f}</span>
                ))}
              </div>
            )}

            {/* JD preview (collapsed) */}
            <details style={{ borderBottom: '1px solid var(--border2)' }}>
              <summary style={{ padding: '12px 32px', cursor: 'pointer', fontSize: 13, color: 'var(--text-2)', userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ ...mono, fontSize: 10, color: 'var(--text-3)' }}>▶</span>
                View full job description
              </summary>
              <div style={{ padding: '0 32px 20px' }}>
                <pre style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-2)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-body)', margin: 0 }}>
                  {job.description}
                </pre>
              </div>
            </details>

            {/* Actions */}
            <div style={{ padding: '20px 32px', display: 'flex', gap: 10, alignItems: 'center' }}>
              <button className="btn btn-secondary" onClick={() => setStep('input')} style={{ fontSize: 13 }}>
                ← Try Again
              </button>
              <button className="btn btn-secondary" onClick={handleCustomize} style={{ fontSize: 13 }}>
                Edit & Customize
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1, padding: '12px', fontSize: 14 }}
                onClick={handlePost}
                disabled={posting}
              >
                {posting
                  ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Posting…</>
                  : matchCount > 0
                    ? `Post Job · Auto-screen ${matchCount} candidate${matchCount !== 1 ? 's' : ''} →`
                    : 'Post Job Instantly →'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
