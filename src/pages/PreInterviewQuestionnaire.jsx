import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const QUESTIONS = [
  {
    id: 'notice_period',
    label: 'What is your current notice period?',
    type: 'radio',
    options: ['Immediately available', 'Less than 2 weeks', '1 month', '2–3 months', '3+ months'],
  },
  {
    id: 'salary_expectation',
    label: 'What are your salary expectations? (annual, gross)',
    type: 'text',
    placeholder: 'e.g. £55,000 – £65,000',
  },
  {
    id: 'right_to_work',
    label: 'Do you have the right to work in the UK without requiring sponsorship?',
    type: 'radio',
    options: ['Yes, I am eligible to work without sponsorship', 'No, I require sponsorship'],
  },
  {
    id: 'other_processes',
    label: 'Are you currently in any other active interview processes?',
    type: 'radio',
    options: ['Yes', 'No'],
  },
  {
    id: 'work_arrangement',
    label: 'What is your preferred working arrangement?',
    type: 'radio',
    options: ['On-site', 'Hybrid', 'Remote', 'Flexible — open to discussion'],
  },
]

export default function PreInterviewQuestionnaire() {
  const { token } = useParams()
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [data, setData]         = useState(null) // { candidate, job, table }
  const [answers, setAnswers]   = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]         = useState(false)
  const [alreadyDone, setAlreadyDone] = useState(false)

  useEffect(() => { load() }, [token])

  async function load() {
    setLoading(true)
    setError('')

    const { data: cRow } = await supabase
      .from('candidates')
      .select('id, full_name, job_id, questionnaire_responses, jobs(title)')
      .eq('interview_invite_token', token)
      .maybeSingle()

    if (cRow) {
      if (cRow.questionnaire_responses) { setAlreadyDone(true); setLoading(false); return }
      setData({ candidate: cRow, job: cRow.jobs, table: 'candidates' })
      setLoading(false)
      return
    }

    const { data: mRow } = await supabase
      .from('job_matches')
      .select('id, questionnaire_responses, talent_pool(full_name), jobs(title)')
      .eq('interview_invite_token', token)
      .maybeSingle()

    if (mRow) {
      if (mRow.questionnaire_responses) { setAlreadyDone(true); setLoading(false); return }
      const candidate = { id: mRow.id, full_name: mRow.talent_pool?.full_name ?? '' }
      setData({ candidate, job: mRow.jobs, table: 'job_matches' })
      setLoading(false)
      return
    }

    setError('Invalid or expired questionnaire link. Please contact your recruiter.')
    setLoading(false)
  }

  function setAnswer(id, value) {
    setAnswers(prev => ({ ...prev, [id]: value }))
  }

  function isComplete() {
    return QUESTIONS.every(q => {
      const a = answers[q.id]
      return a && String(a).trim().length > 0
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isComplete()) return
    setSubmitting(true)

    const payload = {
      questionnaire_responses: {
        completed_at: new Date().toISOString(),
        answers,
      },
    }

    const { error: saveErr } = await supabase
      .from(data.table)
      .update(payload)
      .eq('id', data.candidate.id)

    setSubmitting(false)
    if (saveErr) {
      setError('Could not save your responses. Please try again or contact your recruiter.')
      return
    }
    setDone(true)
  }

  const pageStyle = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontFamily: 'var(--font-body)',
    padding: '32px 16px',
  }

  if (loading) {
    return (
      <div style={pageStyle}>
        <span className="spinner" style={{ width: 36, height: 36 }} />
      </div>
    )
  }

  if (alreadyDone) {
    return (
      <div style={pageStyle}>
        <div style={{ maxWidth: 480, width: '100%', textAlign: 'center', padding: '0 24px' }}>
          <div style={{ fontSize: 32, marginBottom: 16, opacity: 0.4 }}>✓</div>
          <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 300, marginBottom: 8 }}>Already submitted</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 14, lineHeight: 1.7 }}>
            Your questionnaire responses have already been received. You may close this window.
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={pageStyle}>
        <div style={{ maxWidth: 440, width: '100%', textAlign: 'center', padding: '0 24px' }}>
          <div style={{ fontSize: 32, marginBottom: 16, opacity: 0.3 }}>◈</div>
          <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 300, marginBottom: 8 }}>Link not found</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 14, lineHeight: 1.7 }}>{error}</p>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div style={pageStyle}>
        <div style={{ maxWidth: 480, width: '100%', textAlign: 'center', padding: '0 24px' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', border: '2px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 26, color: 'var(--green)' }}>✓</div>
          <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 300, marginBottom: 8 }}>Responses submitted</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
            Thank you, {data.candidate.full_name}. Your responses have been received by the recruitment team.
          </p>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px', textAlign: 'left', marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)', marginBottom: 12 }}>What happens next</div>
            {[
              'The recruiter will review your answers',
              'If selected, you\'ll receive an invitation for a video interview',
              'You\'ll be notified by email regardless of outcome',
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: i < 2 ? 10 : 0 }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(184,146,74,0.15)', border: '1px solid rgba(184,146,74,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10, fontFamily: 'var(--font-mono)', color: '#B8924A' }}>{i + 1}</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{s}</div>
              </div>
            ))}
          </div>
          <p style={{ color: 'var(--text-3)', fontSize: 11, marginTop: 16 }}>You may close this window.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 580, width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 300, letterSpacing: '0.15em', color: '#B8924A', marginBottom: 6, fontSize: 22 }}>ONE SELECT</h1>
          <p style={{ color: 'var(--text-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Pre-Interview Questionnaire</p>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '32px 28px' }}>
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)', marginBottom: 6 }}>
              Application for
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 500, margin: '0 0 4px' }}>{data.job?.title}</h2>
            <p style={{ color: 'var(--text-3)', fontSize: 14, margin: 0 }}>
              Hi {data.candidate.full_name} — please answer the questions below before your interview.
            </p>
          </div>

          {error && (
            <div style={{ marginBottom: 20, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, fontSize: 13, color: 'var(--red)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {QUESTIONS.map((q, qi) => (
              <div key={q.id}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 12, lineHeight: 1.5 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', marginRight: 8 }}>Q{qi + 1}</span>
                  {q.label}
                </div>

                {q.type === 'radio' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {q.options.map(opt => (
                      <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px', border: `1px solid ${answers[q.id] === opt ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--r)', background: answers[q.id] === opt ? 'var(--accent-d)' : 'transparent', transition: 'border-color 0.12s, background 0.12s' }}>
                        <input
                          type="radio"
                          name={q.id}
                          value={opt}
                          checked={answers[q.id] === opt}
                          onChange={() => setAnswer(q.id, opt)}
                          style={{ accentColor: 'var(--accent)', flexShrink: 0 }}
                        />
                        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{opt}</span>
                      </label>
                    ))}
                  </div>
                )}

                {q.type === 'text' && (
                  <input
                    type="text"
                    value={answers[q.id] ?? ''}
                    onChange={e => setAnswer(q.id, e.target.value)}
                    placeholder={q.placeholder}
                    style={{ width: '100%', padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-body)', boxSizing: 'border-box', outline: 'none' }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
                  />
                )}
              </div>
            ))}

            <button
              type="submit"
              disabled={!isComplete() || submitting}
              style={{ width: '100%', padding: '14px 0', background: isComplete() ? '#B8924A' : 'var(--border)', color: isComplete() ? '#fff' : 'var(--text-3)', border: 'none', borderRadius: 8, cursor: isComplete() ? 'pointer' : 'not-allowed', fontSize: 13, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', transition: 'background 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {submitting ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Submitting…</> : 'Submit responses →'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 11, marginTop: 20, letterSpacing: '0.06em' }}>
          ONE SELECT — STRATEGIC TALENT SOLUTIONS
        </p>
      </div>
    </div>
  )
}
