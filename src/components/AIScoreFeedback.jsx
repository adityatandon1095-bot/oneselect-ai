import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const NEG_OPTIONS = [
  { value: 'score_too_high',        label: 'Score too high' },
  { value: 'score_too_low',         label: 'Score too low' },
  { value: 'wrong_skills',          label: 'Wrong skills detected' },
  { value: 'good_candidate_missed', label: 'Good candidate missed' },
]

// Inline thumbs up/down widget shown next to each AI score.
// candidateId, jobId, score: required. onDone: optional callback after save.
export default function AIScoreFeedback({ candidateId, jobId, score, onDone }) {
  const { user } = useAuth()
  const [state, setState] = useState('idle') // idle | neg_open | saving | done
  const [negChoice, setNegChoice] = useState('')

  async function submit(feedbackType) {
    setState('saving')
    await supabase.from('ai_score_feedback').insert({
      candidate_id:  candidateId,
      job_id:        jobId ?? null,
      recruiter_id:  user?.id ?? null,
      score_given:   score,
      feedback_type: feedbackType,
    })
    setState('done')
    onDone?.()
  }

  if (state === 'done') {
    return (
      <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
        ✓ feedback saved
      </span>
    )
  }

  if (state === 'neg_open') {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <select
          autoFocus
          value={negChoice}
          onChange={e => setNegChoice(e.target.value)}
          style={{
            fontSize: 11, padding: '2px 6px', border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
          }}
        >
          <option value="">Select reason…</option>
          {NEG_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {negChoice && (
          <button
            onClick={() => submit(negChoice)}
            style={{ fontSize: 11, padding: '2px 8px', background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
          >
            Submit
          </button>
        )}
        <button
          onClick={() => setState('idle')}
          style={{ fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title="Rate this AI score">
      <button
        onClick={() => submit('positive')}
        disabled={state === 'saving'}
        style={{
          background: 'none', border: '1px solid var(--border)', borderRadius: 2,
          cursor: 'pointer', padding: '1px 5px', fontSize: 12, lineHeight: 1,
          color: 'var(--text-3)',
          transition: 'border-color 0.1s, color 0.1s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-3)' }}
        title="Score looks right"
      >
        👍
      </button>
      <button
        onClick={() => setState('neg_open')}
        disabled={state === 'saving'}
        style={{
          background: 'none', border: '1px solid var(--border)', borderRadius: 2,
          cursor: 'pointer', padding: '1px 5px', fontSize: 12, lineHeight: 1,
          color: 'var(--text-3)',
          transition: 'border-color 0.1s, color 0.1s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--red)'; e.currentTarget.style.color = 'var(--red)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-3)' }}
        title="Score is off"
      >
        👎
      </button>
    </div>
  )
}
