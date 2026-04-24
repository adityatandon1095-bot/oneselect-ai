import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function formatSlot(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function PublicScheduleConfirm() {
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  const slotIdx = parseInt(searchParams.get('slot') ?? '0', 10)

  const [schedule, setSchedule] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed]   = useState(false)

  useEffect(() => { load() }, [token])

  async function load() {
    const { data } = await supabase
      .from('interview_schedules')
      .select('*, jobs(title)')
      .eq('confirm_token', token)
      .maybeSingle()

    if (!data) { setError('Invalid or expired scheduling link.'); setLoading(false); return }
    if (data.status === 'confirmed') { setConfirmed(true); setSchedule(data); setLoading(false); return }
    setSchedule(data)
    setLoading(false)
  }

  async function confirmSlot() {
    setConfirming(true)
    const slots = schedule.proposed_slots ?? []
    const chosen = slots[slotIdx]
    if (!chosen) { setError('Invalid slot.'); setConfirming(false); return }

    const { error: err } = await supabase
      .from('interview_schedules')
      .update({ confirmed_slot: chosen, status: 'confirmed' })
      .eq('confirm_token', token)

    if (err) { setError(err.message); setConfirming(false); return }

    // Send ICS confirmation email
    await supabase.functions.invoke('send-schedule-invite', {
      body: {
        mode: 'confirm',
        token,
        confirmed_slot: chosen,
        job_title: schedule.jobs?.title ?? '',
        candidate_email: schedule.candidate_email,
        candidate_name: schedule.candidate_name,
        room_url: schedule.room_url ?? '',
      },
    })

    setConfirmed(true)
    setConfirming(false)
  }

  if (loading) return <div style={pageStyle}><span className="spinner" style={{ width: 36, height: 36 }} /></div>

  if (error) return (
    <div style={pageStyle}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontSize: 36, marginBottom: 16, opacity: 0.3 }}>◈</div>
        <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 300 }}>Link not found</h2>
        <p style={{ color: 'var(--text-3)', fontSize: 14 }}>{error}</p>
      </div>
    </div>
  )

  const slots = schedule?.proposed_slots ?? []
  const chosen = slots[slotIdx]

  if (confirmed) {
    const confirmedSlot = schedule?.confirmed_slot ?? chosen
    return (
      <div style={pageStyle}>
        <div style={{ textAlign: 'center', maxWidth: 480, padding: '0 24px' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', border: '2px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 26, color: 'var(--green)' }}>✓</div>
          <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 300, marginBottom: 8 }}>Interview confirmed</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 14, lineHeight: 1.7 }}>
            Your live interview for <strong style={{ color: 'var(--text)' }}>{schedule?.jobs?.title}</strong> is confirmed for:
          </p>
          <div style={{ margin: '20px 0', padding: '16px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${GOLD}`, borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{formatSlot(confirmedSlot)}</div>
          </div>
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>A calendar invite has been sent to your email. You may close this window.</p>
        </div>
      </div>
    )
  }

  if (!chosen) return (
    <div style={pageStyle}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: 'var(--text-3)' }}>Invalid slot. Please use one of the links from your invitation email.</p>
      </div>
    </div>
  )

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 480, width: '100%', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 300, letterSpacing: '0.15em', color: GOLD, marginBottom: 6, fontSize: 22 }}>ONE SELECT</h1>
          <p style={{ color: 'var(--text-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Interview Scheduling</p>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '32px 28px' }}>
          <h2 style={{ fontSize: 18, fontWeight: 500, margin: '0 0 6px' }}>{schedule?.jobs?.title}</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 24 }}>Confirm your preferred interview time:</p>

          <div style={{ padding: '20px', background: 'rgba(184,146,74,0.06)', border: '2px solid rgba(184,146,74,0.3)', borderRadius: 10, marginBottom: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', color: GOLD, marginBottom: 8 }}>Selected Time</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{formatSlot(chosen)}</div>
          </div>

          <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>
            By confirming, you and the interviewer will each receive a calendar invite with the meeting link.
          </p>

          <button
            onClick={confirmSlot}
            disabled={confirming}
            style={{ width: '100%', padding: '14px 0', background: GOLD, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase' }}
          >
            {confirming ? 'Confirming…' : 'Confirm This Time →'}
          </button>

          {slots.length > 1 && (
            <div style={{ marginTop: 20 }}>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>Other available times:</p>
              {slots.map((s, i) => i !== slotIdx && (
                <div key={i} style={{ padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-2)', marginBottom: 6, cursor: 'default' }}>
                  {formatSlot(s)}
                  <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 8 }}>(use the link for this slot from your email)</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 11, marginTop: 20, letterSpacing: '0.06em' }}>
          ONE SELECT — STRATEGIC TALENT SOLUTIONS
        </p>
      </div>
    </div>
  )
}

const GOLD = '#B8924A'
const pageStyle = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-body)',
}
