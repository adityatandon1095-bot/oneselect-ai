import { useState, useRef, useEffect } from 'react'
import { callClaude } from '../utils/api'

const INTERVIEW_COMPLETE = 'INTERVIEW_COMPLETE'

function interviewSystem(jd, candidate) {
  const p = candidate.parsed
  return `You are an expert technical interviewer conducting a structured job interview.

Role: ${jd.title}
Required skills: ${jd.requiredSkills.join(', ')}
${jd.preferredSkills.length ? `Preferred skills: ${jd.preferredSkills.join(', ')}` : ''}

Candidate profile:
- Name: ${p.name}
- Current role: ${p.currentRole} (${p.totalYears} years experience)
- Skills: ${p.skills.join(', ')}
- Education: ${p.education}
- Highlights: ${p.highlights.join('; ')}

Interview rules:
1. Begin with a professional greeting and your first question
2. Ask questions personalised to THIS candidate's actual CV — reference specific roles, projects, or skills they mention
3. Weight questions: roughly ${jd.technicalWeight}% technical depth, ${jd.communicationWeight}% behavioural/communication
4. Probe strong answers for depth; give space on weaker ones
5. Keep each response to one question at a time
6. After the candidate has answered 4-5 questions, naturally conclude the interview and append exactly: ${INTERVIEW_COMPLETE}
7. Be professional, warm, and conversational`
}

const SCORING_SYSTEM = `You are an interview evaluator. Analyse the provided interview transcript and return ONLY valid JSON — no markdown fences, no explanation:
{
  "technicalAbility": number 0-100,
  "communication": number 0-100,
  "roleFit": number 0-100,
  "problemSolving": number 0-100,
  "experienceRelevance": number 0-100,
  "overallScore": number 0-100,
  "recommendation": "Strong Hire" | "Hire" | "Borderline" | "Reject",
  "confidence": number 0-100,
  "insight": "2-3 sentence overall assessment",
  "strengths": ["up to 3 key strengths demonstrated"],
  "flags": ["0-3 concerns or red flags"],
  "bestAnswer": "verbatim quote of the candidate's strongest answer, max 100 words"
}`

const DIMS = [
  ['technicalAbility',   'Technical Ability'],
  ['communication',      'Communication'],
  ['roleFit',            'Role Fit'],
  ['problemSolving',     'Problem Solving'],
  ['experienceRelevance','Experience Relevance'],
]

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
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border2)" strokeWidth="4" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`} />
      </svg>
      <div className="ring-inner">
        <span className="ring-val">{score}</span>
      </div>
    </div>
  )
}

const initState = () => ({
  messages: [],
  input: '',
  loading: false,
  complete: false,
  scoring: false,
  scores: null,
})

export default function Interviews({ jobDefinition, candidates, onNext }) {
  const passed = candidates.filter((c) => c.screening?.pass)

  const [states, setStates] = useState(() =>
    Object.fromEntries(passed.map((c) => [c.id, initState()]))
  )
  const [selectedId, setSelectedId] = useState(passed[0]?.id ?? null)
  const bottomRef = useRef()

  const patch = (id, updates) =>
    setStates((prev) => ({ ...prev, [id]: { ...prev[id], ...updates } }))

  // Scroll chat to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [states[selectedId]?.messages, states[selectedId]?.loading])

  const startInterview = async (c) => {
    const id = c.id
    patch(id, { loading: true })
    try {
      const sys = interviewSystem(jobDefinition, c)
      const reply = await callClaude(
        [{ role: 'user', content: 'Please begin the interview.' }],
        sys, 1024,
      )
      const complete = reply.includes(INTERVIEW_COMPLETE)
      const msgs = [{ role: 'assistant', content: reply }]
      patch(id, { messages: msgs, loading: false, complete })
      if (complete) scoreInterview(id, msgs)
    } catch {
      patch(id, { loading: false })
    }
  }

  const sendMessage = async (c, text) => {
    if (!text.trim()) return
    const id = c.id
    const cur = states[id]
    const msgs = [...cur.messages, { role: 'user', content: text }]
    patch(id, { messages: msgs, input: '', loading: true })
    try {
      const sys = interviewSystem(jobDefinition, c)
      const reply = await callClaude(msgs, sys, 1024)
      const complete = reply.includes(INTERVIEW_COMPLETE)
      const all = [...msgs, { role: 'assistant', content: reply }]
      patch(id, { messages: all, loading: false, complete })
      if (complete) scoreInterview(id, all)
    } catch {
      patch(id, { loading: false })
    }
  }

  const scoreInterview = async (id, messages) => {
    patch(id, { scoring: true })
    const transcript = messages
      .map((m) => `${m.role === 'user' ? 'Candidate' : 'Interviewer'}: ${m.content.replace(INTERVIEW_COMPLETE, '').trim()}`)
      .join('\n\n')
    try {
      const text = await callClaude(
        [{ role: 'user', content: `Score this interview:\n\n${transcript}` }],
        SCORING_SYSTEM, 2048,
      )
      const scores = JSON.parse(text.trim())
      patch(id, { scoring: false, scores })
    } catch {
      patch(id, { scoring: false })
    }
  }

  const selected   = passed.find((c) => c.id === selectedId)
  const selState   = selectedId ? states[selectedId] : null
  const doneSome   = passed.some((c) => states[c.id]?.scores !== null)

  const proceed = () => {
    const updated = candidates.map((c) => {
      const s = states[c.id]
      if (!s) return c
      return { ...c, interview: { messages: s.messages, complete: s.complete, scores: s.scores } }
    })
    onNext(updated)
  }

  return (
    <div className="interviews-wrap">
      {/* ── Sidebar ── */}
      <div className="interviews-sidebar">
        <div className="sidebar-head">
          <h3>Candidates</h3>
          <span className="mono text-muted" style={{ fontSize: 11 }}>{passed.length} passed</span>
        </div>
        {passed.map((c) => {
          const s = states[c.id]
          const started = s.messages.length > 0
          const active  = c.id === selectedId
          return (
            <div
              key={c.id}
              className={`sidebar-item${active ? ' active' : ''}`}
              onClick={() => setSelectedId(c.id)}
            >
              <div className="sidebar-cname">{c.parsed.name}</div>
              <div className="sidebar-crole">{c.parsed.currentRole}</div>
              {!started && <span className="badge badge-amber">Not started</span>}
              {started && !s.complete && <span className="badge badge-blue">In progress</span>}
              {s.complete && !s.scores && <span className="badge badge-amber">Scoring…</span>}
              {s.scores && (
                <span className="badge badge-green">
                  Done · {s.scores.overallScore}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Main panel ── */}
      <div className="interviews-panel">
        {selected && selState ? (
          <>
            <div className="chat-header">
              <div>
                <h3>{selected.parsed.name}</h3>
                <p>{selected.parsed.currentRole}</p>
              </div>
              {selState.scores && (
                <div className="chat-top-score">
                  <span className="score-big">{selState.scores.overallScore}</span>
                  <span className="score-rec" style={{ color: recColor(selState.scores.recommendation) }}>
                    {selState.scores.recommendation}
                  </span>
                </div>
              )}
            </div>

            <div className="chat-body">
              {selState.messages.length === 0 && !selState.loading && (
                <div className="chat-empty">
                  <p>Ready to interview <strong style={{ color: 'var(--text)' }}>{selected.parsed.name}</strong></p>
                  <button className="btn btn-primary" onClick={() => startInterview(selected)}>
                    Start Interview
                  </button>
                </div>
              )}

              {selState.messages.map((msg, i) => (
                <div key={i} className={`bubble ${msg.role}`}>
                  <div className="bubble-role">{msg.role === 'assistant' ? 'Interviewer' : 'You'}</div>
                  <div className="bubble-text">
                    {msg.content.replace(INTERVIEW_COMPLETE, '').trim()}
                  </div>
                </div>
              ))}

              {selState.loading && (
                <div className="bubble assistant">
                  <div className="bubble-role">Interviewer</div>
                  <div className="bubble-text">
                    <div className="typing-dots"><span/><span/><span/></div>
                  </div>
                </div>
              )}

              {selState.scoring && (
                <div className="scoring-banner">
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                  Analysing transcript and generating scores…
                </div>
              )}

              {selState.scores && (
                <div className="interview-score-card">
                  <h4>Interview Scores</h4>
                  {DIMS.map(([key, label]) => (
                    <div key={key} className="score-dim">
                      <span className="dim-label">{label}</span>
                      <div className="dim-track">
                        <div className="dim-fill" style={{ width: `${selState.scores[key]}%`, background: dimColor(selState.scores[key]) }} />
                      </div>
                      <span className="dim-val">{selState.scores[key]}</span>
                    </div>
                  ))}
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {!selState.complete && selState.messages.length > 0 && (
              <div className="chat-input-bar">
                <input
                  type="text"
                  placeholder="Type your answer and press Enter…"
                  value={selState.input}
                  disabled={selState.loading}
                  onChange={(e) => patch(selectedId, { input: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage(selected, selState.input)
                    }
                  }}
                />
                <button
                  className="btn btn-primary"
                  disabled={selState.loading || !selState.input.trim()}
                  onClick={() => sendMessage(selected, selState.input)}
                >
                  Send
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="chat-empty" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p>Select a candidate to begin</p>
          </div>
        )}

        <div className="interviews-footer">
          <button className="btn btn-primary" disabled={!doneSome} onClick={proceed}>
            View Results →
          </button>
          {!doneSome && (
            <span className="text-muted" style={{ fontSize: 12 }}>
              Complete at least one interview to continue
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function recColor(rec) {
  if (rec === 'Strong Hire') return 'var(--green)'
  if (rec === 'Hire')        return 'var(--accent)'
  if (rec === 'Borderline')  return 'var(--amber)'
  return 'var(--red)'
}
