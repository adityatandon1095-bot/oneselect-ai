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
    const { type, candidateEmail, candidateName, jobTitle } = await req.json()

    if (!candidateEmail || !type) {
      return new Response(JSON.stringify({ error: 'candidateEmail and type are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resendKey = Deno.env.get('RESEND_API_KEY') ?? ''
    const appUrl    = Deno.env.get('APP_URL') ?? 'https://oneselect.ai'
    const name      = candidateName ?? 'there'
    const role      = jobTitle ?? 'the role'

    let subject = ''
    let body    = ''

    if (type === 'shortlisted') {
      subject = `You've been shortlisted — ${role}`
      body = `
        <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#F8F7F4;padding:40px;">
          <div style="text-align:center;padding:24px 0;border-bottom:1px solid #E8E4DC;margin-bottom:32px;">
            <h1 style="font-family:Georgia,serif;color:#B8924A;font-weight:300;letter-spacing:0.15em;font-size:26px;margin:0;">ONE SELECT</h1>
          </div>
          <div style="background:white;padding:40px;border:1px solid #E8E4DC;">
            <h2 style="font-family:Georgia,serif;color:#2D3748;font-weight:400;font-size:20px;margin:0 0 16px;">Hi ${name},</h2>
            <p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 16px;">
              Good news — your application for <strong style="color:#2D3748;">${role}</strong> has been reviewed and you've been <strong style="color:#B8924A;">shortlisted</strong>.
            </p>
            <p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 32px;">
              A member of our recruitment team will be in touch shortly with next steps. In the meantime, make sure your profile is up to date.
            </p>
            <a href="${appUrl}/candidate/dashboard" style="background:#B8924A;color:white;padding:12px 32px;text-decoration:none;font-family:monospace;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;display:inline-block;">View Your Profile →</a>
          </div>
          <p style="text-align:center;color:#9CA3AF;font-size:11px;margin-top:24px;">ONE SELECT — STRATEGIC TALENT SOLUTIONS</p>
        </div>`
    } else if (type === 'hired') {
      subject = `Congratulations — offer for ${role}`
      body = `
        <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#F8F7F4;padding:40px;">
          <div style="text-align:center;padding:24px 0;border-bottom:1px solid #E8E4DC;margin-bottom:32px;">
            <h1 style="font-family:Georgia,serif;color:#B8924A;font-weight:300;letter-spacing:0.15em;font-size:26px;margin:0;">ONE SELECT</h1>
          </div>
          <div style="background:white;padding:40px;border:1px solid #E8E4DC;">
            <h2 style="font-family:Georgia,serif;color:#2D3748;font-weight:400;font-size:20px;margin:0 0 16px;">Hi ${name},</h2>
            <p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 16px;">
              Congratulations! We're delighted to let you know that you've been <strong style="color:#B8924A;">selected</strong> for the <strong style="color:#2D3748;">${role}</strong> position.
            </p>
            <p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 32px;">
              Your recruiter will be in touch shortly with your formal offer and next steps. We look forward to welcoming you.
            </p>
            <a href="${appUrl}/candidate/dashboard" style="background:#B8924A;color:white;padding:12px 32px;text-decoration:none;font-family:monospace;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;display:inline-block;">View Your Dashboard →</a>
          </div>
          <p style="text-align:center;color:#9CA3AF;font-size:11px;margin-top:24px;">ONE SELECT — STRATEGIC TALENT SOLUTIONS</p>
        </div>`
    } else if (type === 'application_received') {
      subject = `Application received — ${role}`
      body = `
        <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#F8F7F4;padding:40px;">
          <div style="text-align:center;padding:24px 0;border-bottom:1px solid #E8E4DC;margin-bottom:32px;">
            <h1 style="font-family:Georgia,serif;color:#B8924A;font-weight:300;letter-spacing:0.15em;font-size:26px;margin:0;">ONE SELECT</h1>
          </div>
          <div style="background:white;padding:40px;border:1px solid #E8E4DC;">
            <h2 style="font-family:Georgia,serif;color:#2D3748;font-weight:400;font-size:20px;margin:0 0 16px;">Hi ${name},</h2>
            <p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 16px;">
              Thank you for applying for <strong style="color:#2D3748;">${role}</strong>. We've received your application and our team will review it shortly.
            </p>
            <p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 16px;">
              <strong style="color:#2D3748;">What happens next:</strong>
            </p>
            <ol style="color:#6B7280;line-height:2;font-size:14px;margin:0 0 24px;padding-left:20px;">
              <li>Our AI screening reviews your CV against the role requirements (usually within 24 hours)</li>
              <li>If shortlisted, you'll receive a link to complete a short video interview</li>
              <li>A recruiter reviews all video interviews and makes a decision within 3–5 business days</li>
            </ol>
            <p style="color:#9CA3AF;font-size:13px;margin:0 0 32px;">Questions? Reply to this email or contact us at <a href="mailto:candidates@oneselect.co.uk" style="color:#B8924A;">candidates@oneselect.co.uk</a></p>
          </div>
          <p style="text-align:center;color:#9CA3AF;font-size:11px;margin-top:24px;">ONE SELECT — STRATEGIC TALENT SOLUTIONS</p>
        </div>`
    } else {
      return new Response(JSON.stringify({ error: `Unknown notification type: ${type}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { ok: sent, data: result } = await sendEmail(resendKey, {
      from:    FROM_EMAIL,
      to:      [candidateEmail],
      subject,
      html: body,
    }, 'notify-candidate', candidateEmail)
    return new Response(JSON.stringify({ sent, detail: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
