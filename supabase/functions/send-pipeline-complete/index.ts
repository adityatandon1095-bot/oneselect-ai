import { FROM_EMAIL } from "../_shared/email.ts"
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"

async function sendEmail(resendKey: string, payload: Record<string, unknown>, fnName: string, recipient: string) {
  const call = () => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
    body: JSON.stringify(payload),
  })
  try {
    const res = await call()
    if (res.ok) return { ok: true, data: await res.json() }
    await new Promise(r => setTimeout(r, 1000))
    const retry = await call()
    if (retry.ok) return { ok: true, data: await retry.json() }
    console.error(`[${fnName}] email failed after retry for ${recipient}`)
    return { ok: false, data: await retry.json().catch(() => null) }
  } catch {
    await new Promise(r => setTimeout(r, 1000))
    try {
      const retry = await call()
      if (retry.ok) return { ok: true, data: await retry.json() }
      console.error(`[${fnName}] email retry threw for ${recipient}`)
      return { ok: false, data: null }
    } catch (e) {
      console.error(`[${fnName}] email both attempts threw for ${recipient}:`, e)
      return { ok: false, data: null }
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { clientEmail, clientName, jobTitle, totalProcessed, totalPassed, topCandidates } = await req.json()

    if (!clientEmail) {
      return new Response(JSON.stringify({ error: 'clientEmail is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resendKey = Deno.env.get('RESEND_API_KEY') ?? ''
    const appUrl    = 'https://oneselect-ai-t6uo-phi.vercel.app'

    const recColor = (r: string) => {
      if (r === 'Strong Hire') return '#2d7d4e'
      if (r === 'Hire')        return '#1a6b9a'
      if (r === 'Borderline')  return '#b7791f'
      return '#c53030'
    }

    const topRows = (topCandidates ?? []).map((c: { name: string; role: string; overallScore: number; recommendation: string; matchScore: number }) => `
      <tr style="border-bottom:1px solid #e2e8f0">
        <td style="padding:12px 8px;font-size:13px;font-weight:600;color:#2b3a4f">${c.name}</td>
        <td style="padding:12px 8px;font-size:12px;color:#718096">${c.role}</td>
        <td style="padding:12px 8px;text-align:center">
          <span style="font-size:16px;font-weight:700;color:${c.overallScore >= 70 ? '#2d7d4e' : c.overallScore >= 50 ? '#1a6b9a' : '#c53030'}">${c.overallScore}</span>
          <span style="font-size:10px;color:#718096">/100</span>
        </td>
        <td style="padding:12px 8px;text-align:center">
          <span style="font-size:11px;font-weight:600;color:${recColor(c.recommendation)}">${c.recommendation ?? '—'}</span>
        </td>
      </tr>
    `).join('')

    const topTable = topCandidates?.length ? `
      <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
        <thead>
          <tr style="border-bottom:2px solid #e2e8f0">
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#a0aec0">Candidate</th>
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#a0aec0">Role</th>
            <th style="padding:8px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#a0aec0">Score</th>
            <th style="padding:8px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#a0aec0">Recommendation</th>
          </tr>
        </thead>
        <tbody>${topRows}</tbody>
      </table>
    ` : ''

    const body = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2b3a4f">
        <div style="background:#b8943f;padding:24px 32px">
          <h1 style="color:#fff;font-size:22px;margin:0;font-weight:400;letter-spacing:0.05em">ONE SELECT</h1>
          <p style="color:rgba(255,255,255,0.8);font-size:13px;margin:6px 0 0">AI Hiring Pipeline Complete</p>
        </div>
        <div style="padding:32px">
          <p style="font-size:15px;margin:0 0 8px">Hi ${clientName ?? 'there'},</p>
          <p style="font-size:14px;line-height:1.7;color:#4a5568;margin:0 0 24px">
            The full AI pipeline for <strong>${jobTitle ?? 'your open role'}</strong> has completed.
            Here's a summary of what was found:
          </p>

          <div style="display:flex;gap:24px;margin:0 0 28px">
            <div style="flex:1;background:#f7fafc;border:1px solid #e2e8f0;border-radius:8px;padding:18px;text-align:center">
              <div style="font-size:30px;font-weight:700;color:#2b3a4f">${totalProcessed ?? 0}</div>
              <div style="font-size:12px;color:#718096;margin-top:4px">CVs Processed</div>
            </div>
            <div style="flex:1;background:#f0fff4;border:1px solid #c6f6d5;border-radius:8px;padding:18px;text-align:center">
              <div style="font-size:30px;font-weight:700;color:#2d7d4e">${totalPassed ?? 0}</div>
              <div style="font-size:12px;color:#718096;margin-top:4px">Passed Screening</div>
            </div>
            <div style="flex:1;background:#ebf8ff;border:1px solid #bee3f8;border-radius:8px;padding:18px;text-align:center">
              <div style="font-size:30px;font-weight:700;color:#1a6b9a">${(topCandidates ?? []).length}</div>
              <div style="font-size:12px;color:#718096;margin-top:4px">AI Interviewed</div>
            </div>
          </div>

          ${topCandidates?.length ? `<p style="font-size:13px;font-weight:600;color:#2b3a4f;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.06em">Top Candidates</p>${topTable}` : ''}

          <p style="font-size:14px;line-height:1.7;color:#4a5568;margin:0 0 24px">
            Each candidate has been automatically screened against the job requirements and put through an AI interview simulation.
            Log in to review full profiles, transcripts, and scores.
          </p>
          <a href="${appUrl}/client/pipeline" style="display:inline-block;background:#b8943f;color:#fff;text-decoration:none;padding:13px 28px;border-radius:6px;font-size:14px;font-weight:600">View Full Results →</a>
        </div>
        <div style="padding:20px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#a0aec0">
          One Select · Strategic Talent Solutions · Automated Pipeline Report
        </div>
      </div>
    `

    const { ok: sent, data: emailResult } = await sendEmail(resendKey, {
      from:    FROM_EMAIL,
      to:      [clientEmail],
      subject: `Pipeline complete: ${totalPassed ?? 0} candidate${(totalPassed ?? 0) !== 1 ? 's' : ''} passed for ${jobTitle ?? 'your role'}`,
      html:    body,
    }, 'send-pipeline-complete', clientEmail)
    return new Response(JSON.stringify({ sent, detail: emailResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
