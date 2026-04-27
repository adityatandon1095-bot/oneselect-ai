import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { candidateName, candidateEmail, jobTitle, companyName, notes } = await req.json()

    if (!candidateEmail) {
      return new Response(JSON.stringify({ error: 'candidateEmail is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resendKey = Deno.env.get('RESEND_API_KEY') ?? ''
    const fromEmail = 'noreply@oneselect.co.uk'
    const displayName = companyName ?? 'One Select'

    const body = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#2b3a4f">
        <div style="background:#b8943f;padding:24px 32px">
          <h1 style="color:#fff;font-size:22px;margin:0;font-weight:400;letter-spacing:0.05em">ONE SELECT</h1>
        </div>
        <div style="padding:32px">
          <p style="font-size:15px;margin:0 0 16px">Dear ${candidateName ?? 'Candidate'},</p>
          <p style="font-size:14px;line-height:1.7;color:#4a5568;margin:0 0 16px">
            Thank you for taking the time to apply for the <strong>${jobTitle ?? 'position'}</strong> role${companyName ? ` at <strong>${companyName}</strong>` : ''}.
            We appreciate your interest and the effort you put into your application.
          </p>
          <p style="font-size:14px;line-height:1.7;color:#4a5568;margin:0 0 16px">
            After careful consideration, we regret to inform you that we will not be moving forward
            with your application at this time. This was a competitive process and we have decided
            to proceed with candidates whose experience more closely matches our current requirements.
          </p>
          ${notes ? `<p style="font-size:14px;line-height:1.7;color:#4a5568;margin:0 0 16px">${notes}</p>` : ''}
          <p style="font-size:14px;line-height:1.7;color:#4a5568;margin:0 0 32px">
            We wish you the very best in your job search and future career endeavours.
            We encourage you to apply for future roles that match your profile.
          </p>
          <p style="font-size:14px;margin:0">Kind regards,<br/><strong>${displayName} Recruitment Team</strong></p>
        </div>
        <div style="padding:20px 32px;border-top:1px solid #e2e8f0;font-size:11px;color:#a0aec0">
          This email was sent by ${displayName}. If you have any questions, please contact your recruiter directly.
        </div>
      </div>
    `

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
      body: JSON.stringify({
        from:    `${displayName} <${fromEmail}>`,
        to:      [candidateEmail],
        subject: `Your application for ${jobTitle ?? 'the position'}`,
        html:    body,
      }),
    })

    const emailResult = await emailRes.json()
    const sent = emailRes.ok

    return new Response(JSON.stringify({ sent, detail: emailResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
