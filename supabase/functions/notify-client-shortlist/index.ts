import { FROM_EMAIL } from "../_shared/email.ts"
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { clientEmail, clientName, jobTitle, candidateCount } = await req.json()

    if (!clientEmail || !jobTitle) {
      return new Response(JSON.stringify({ error: 'clientEmail and jobTitle are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resendKey = Deno.env.get('RESEND_API_KEY') ?? ''
    const appUrl    = Deno.env.get('APP_URL') ?? 'https://oneselect.ai'
    const name      = clientName ?? 'there'
    const n         = candidateCount ?? 'Several'
    const plural    = candidateCount === 1 ? 'candidate is' : 'candidates are'

    const subject = `${n} candidate${candidateCount === 1 ? '' : 's'} ready for your review — ${jobTitle}`

    const html = `
      <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#F8F7F4;padding:40px;">
        <div style="text-align:center;padding:24px 0;border-bottom:1px solid #E8E4DC;margin-bottom:32px;">
          <h1 style="font-family:Georgia,serif;color:#B8924A;font-weight:300;letter-spacing:0.15em;font-size:26px;margin:0;">ONE SELECT</h1>
        </div>
        <div style="background:white;padding:40px;border:1px solid #E8E4DC;">
          <h2 style="font-family:Georgia,serif;color:#2D3748;font-weight:400;font-size:20px;margin:0 0 16px;">Hi ${name},</h2>
          <p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 16px;">
            <strong style="color:#2D3748;">${n} ${plural}</strong> ready for your review for the <strong style="color:#2D3748;">${jobTitle}</strong> position.
          </p>
          <p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 24px;">
            Please log in to your client portal to review each candidate's screening results and approve or reject them for the next stage.
          </p>
          <a href="${appUrl}/client/candidates" style="background:#B8924A;color:white;padding:14px 36px;text-decoration:none;font-family:monospace;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;display:inline-block;margin-bottom:24px;">Review Shortlist →</a>
          <p style="color:#9CA3AF;font-size:13px;margin:0;line-height:1.6;">
            Questions? Reply to this email or contact your recruiter directly.
          </p>
        </div>
        <p style="text-align:center;color:#9CA3AF;font-size:11px;margin-top:24px;">ONE SELECT — STRATEGIC TALENT SOLUTIONS</p>
      </div>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      [clientEmail],
        subject,
        html,
      }),
    })

    const data = await res.json()
    return new Response(JSON.stringify({ sent: res.ok, detail: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
