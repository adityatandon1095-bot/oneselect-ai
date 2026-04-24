import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function formatSlot(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function generateICS(slot: string, jobTitle: string, candidateName: string, organizerEmail: string, roomUrl: string) {
  const start = new Date(slot)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  const fmt = (d: Date) => d.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z'
  const uid = crypto.randomUUID()

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//One Select//Interview Scheduler//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:Live Interview — ${jobTitle}`,
    `DESCRIPTION:Live interview for ${jobTitle} with ${candidateName}.${roomUrl ? `\\nMeeting: ${roomUrl}` : ''}`,
    `LOCATION:${roomUrl || 'To be confirmed'}`,
    `ORGANIZER:mailto:${organizerEmail}`,
    'STATUS:CONFIRMED',
    `UID:${uid}@oneselect.ai`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const resendKey = Deno.env.get('RESEND_API_KEY') ?? ''
    const appUrl = Deno.env.get('APP_URL') ?? 'https://oneselect-ai-t6uo-phi.vercel.app'

    // ── Propose: send slot options to candidate ────────────────────────────
    if (body.mode === 'propose') {
      const { token, proposed_slots, job_title, candidate_email, candidate_name, room_url } = body

      const slotsHtml = (proposed_slots as string[]).map((slot, i) => `
        <div style="margin-bottom:12px;padding:18px 20px;background:#F8F7F4;border:1px solid #E8E4DC;border-radius:6px;">
          <div style="font-family:monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#9CA3AF;margin-bottom:6px;">Option ${i + 1}</div>
          <div style="font-size:15px;color:#2D3748;font-weight:500;margin-bottom:12px;">${formatSlot(slot)}</div>
          <a href="${appUrl}/schedule/${token}?slot=${i}" style="background:#B8924A;color:white;padding:8px 22px;text-decoration:none;font-family:monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;display:inline-block;border-radius:4px;">CONFIRM THIS TIME →</a>
        </div>
      `).join('')

      const html = `
        <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#F8F7F4;padding:40px;">
          <div style="text-align:center;padding:32px 0;border-bottom:1px solid #E8E4DC;margin-bottom:32px;">
            <h1 style="font-family:Georgia,serif;color:#B8924A;font-weight:300;letter-spacing:0.15em;font-size:28px;margin:0;">ONE SELECT</h1>
            <p style="color:#9CA3AF;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin:8px 0 0;">Interview Scheduling</p>
          </div>
          <div style="background:white;padding:40px;border:1px solid #E8E4DC;">
            <h2 style="font-family:Georgia,serif;color:#2D3748;font-weight:400;font-size:22px;margin:0 0 16px;">Hi ${candidate_name},</h2>
            <p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 24px;">
              Congratulations on progressing to the live interview stage for <strong style="color:#2D3748;">${job_title}</strong>.
              Please select your preferred time from the options below — click the button under your chosen slot to confirm.
            </p>
            ${slotsHtml}
            ${room_url ? `
            <div style="background:#F8F7F4;border:1px solid #E8E4DC;border-left:4px solid #B8924A;padding:16px 20px;margin:24px 0;border-radius:4px;">
              <p style="margin:0 0 4px;color:#9CA3AF;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;font-family:monospace;">Meeting Room</p>
              <a href="${room_url}" style="color:#B8924A;font-size:13px;">${room_url}</a>
            </div>` : ''}
            <p style="color:#9CA3AF;font-size:13px;line-height:1.6;margin:24px 0 0;padding-top:24px;border-top:1px solid #E8E4DC;">
              Once you confirm, you and the interviewer will each receive a calendar invite. Each link is unique to its time slot.
            </p>
          </div>
          <p style="text-align:center;color:#9CA3AF;font-size:11px;margin-top:24px;letter-spacing:0.08em;">ONE SELECT — STRATEGIC TALENT SOLUTIONS</p>
        </div>
      `

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + resendKey },
        body: JSON.stringify({
          from: 'One Select <noreply@oneselect.ai>',
          to: [candidate_email],
          subject: `Live Interview Invitation — ${job_title}`,
          html,
        }),
      })

      const result = await emailRes.json()
      console.log('send-schedule-invite (propose):', result)
      return new Response(JSON.stringify({ success: emailRes.ok }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Confirm: send ICS calendar invite to candidate ─────────────────────
    if (body.mode === 'confirm') {
      const { confirmed_slot, job_title, candidate_email, candidate_name, room_url, recruiter_email } = body

      const icsContent = generateICS(
        confirmed_slot,
        job_title,
        candidate_name,
        recruiter_email || 'noreply@oneselect.ai',
        room_url || '',
      )
      const icsBase64 = btoa(icsContent)

      const html = `
        <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#F8F7F4;padding:40px;">
          <div style="text-align:center;padding:32px 0;border-bottom:1px solid #E8E4DC;margin-bottom:32px;">
            <h1 style="font-family:Georgia,serif;color:#B8924A;font-weight:300;letter-spacing:0.15em;font-size:28px;margin:0;">ONE SELECT</h1>
            <p style="color:#9CA3AF;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin:8px 0 0;">Interview Confirmed</p>
          </div>
          <div style="background:white;padding:40px;border:1px solid #E8E4DC;">
            <div style="text-align:center;margin-bottom:28px;">
              <div style="width:56px;height:56px;border-radius:50%;background:rgba(34,197,94,0.1);border:2px solid rgba(34,197,94,0.3);display:inline-flex;align-items:center;justify-content:center;font-size:24px;color:#22c55e;margin:0 auto;">✓</div>
            </div>
            <h2 style="font-family:Georgia,serif;color:#2D3748;font-weight:400;font-size:22px;margin:0 0 16px;text-align:center;">Interview Confirmed</h2>
            <p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 24px;text-align:center;">
              Your live interview for <strong style="color:#2D3748;">${job_title}</strong> is confirmed.
            </p>
            <div style="background:#F8F7F4;border:1px solid #E8E4DC;border-left:4px solid #B8924A;padding:20px;margin:0 0 24px;text-align:center;border-radius:4px;">
              <p style="margin:0 0 6px;font-family:monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#9CA3AF;">Confirmed Time</p>
              <p style="margin:0;font-size:16px;font-weight:600;color:#2D3748;">${formatSlot(confirmed_slot)}</p>
            </div>
            ${room_url ? `
            <div style="text-align:center;margin:24px 0;">
              <a href="${room_url}" style="background:#B8924A;color:white;padding:12px 32px;text-decoration:none;font-family:monospace;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;display:inline-block;border-radius:4px;">JOIN MEETING →</a>
            </div>` : ''}
            <p style="color:#9CA3AF;font-size:13px;line-height:1.6;margin:24px 0 0;padding-top:24px;border-top:1px solid #E8E4DC;text-align:center;">
              A calendar invite (.ics) is attached. Add it to your calendar to set a reminder.
            </p>
          </div>
          <p style="text-align:center;color:#9CA3AF;font-size:11px;margin-top:24px;letter-spacing:0.08em;">ONE SELECT — STRATEGIC TALENT SOLUTIONS</p>
        </div>
      `

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + resendKey },
        body: JSON.stringify({
          from: 'One Select <noreply@oneselect.ai>',
          to: [candidate_email],
          subject: `Confirmed: Live Interview — ${job_title}`,
          html,
          attachments: [{ filename: 'interview.ics', content: icsBase64 }],
        }),
      })

      const result = await emailRes.json()
      console.log('send-schedule-invite (confirm):', result)
      return new Response(JSON.stringify({ success: emailRes.ok }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown mode' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-schedule-invite error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
