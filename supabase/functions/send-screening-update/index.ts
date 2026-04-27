import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { clientEmail, clientName, jobTitle, totalScreened, totalPassed } = await req.json()

    if (!clientEmail) {
      return new Response(JSON.stringify({ error: 'clientEmail is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resendKey = Deno.env.get('RESEND_API_KEY') ?? ''
    const appUrl    = 'https://oneselect-ai-t6uo-phi.vercel.app'

    const body = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#2b3a4f">
        <div style="background:#b8943f;padding:24px 32px">
          <h1 style="color:#fff;font-size:22px;margin:0;font-weight:400;letter-spacing:0.05em">ONE SELECT</h1>
        </div>
        <div style="padding:32px">
          <p style="font-size:15px;margin:0 0 16px">Hi ${clientName ?? 'there'},</p>
          <p style="font-size:14px;line-height:1.7;color:#4a5568;margin:0 0 16px">
            AI screening has completed for <strong>${jobTitle ?? 'your open role'}</strong>.
          </p>
          <div style="background:#f7fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px 24px;margin:0 0 24px;display:flex;gap:32px">
            <div style="text-align:center">
              <div style="font-size:32px;font-weight:700;color:#2b3a4f">${totalScreened}</div>
              <div style="font-size:12px;color:#718096;margin-top:4px">Screened</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:32px;font-weight:700;color:#2d7d4e">${totalPassed}</div>
              <div style="font-size:12px;color:#718096;margin-top:4px">Passed</div>
            </div>
          </div>
          <p style="font-size:14px;line-height:1.7;color:#4a5568;margin:0 0 24px">
            Your recruiter will be in touch to discuss next steps. You can also log in to view the full results.
          </p>
          <a href="${appUrl}/client/pipeline" style="display:inline-block;background:#b8943f;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600">View Pipeline →</a>
        </div>
        <div style="padding:20px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#a0aec0">
          One Select · Strategic Talent Solutions
        </div>
      </div>
    `

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
      body: JSON.stringify({
        from:    'One Select <noreply@oneselect.co.uk>',
        to:      [clientEmail],
        subject: `Screening complete: ${totalPassed} candidate${totalPassed !== 1 ? 's' : ''} passed for ${jobTitle ?? 'your role'}`,
        html:    body,
      }),
    })

    const emailResult = await emailRes.json()
    return new Response(JSON.stringify({ sent: emailRes.ok, detail: emailResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
