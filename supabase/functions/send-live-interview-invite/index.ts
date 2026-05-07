import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
    const { email, name, job_title, company_name, token, room_url } = await req.json()
    const resendKey = Deno.env.get('RESEND_API_KEY') ?? ''
    const appUrl    = 'https://oneselect-ai-t6uo-phi.vercel.app'
    const link      = `${appUrl}/live/${token}`

    const { ok: emailSent } = await sendEmail(resendKey, {
      from: 'One Select <noreply@oneselect.ai>',
      to: [email],
      subject: `Live interview invitation — ${job_title}`,
      html: `
          <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#F8F7F4;padding:40px;">
            <div style="text-align:center;padding:32px 0;border-bottom:1px solid #E8E4DC;margin-bottom:32px;">
              <h1 style="font-family:Georgia,serif;color:#B8924A;font-weight:300;letter-spacing:0.15em;font-size:28px;margin:0;">ONE SELECT</h1>
              <p style="color:#9CA3AF;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin:8px 0 0;">Strategic Talent Solutions</p>
            </div>
            <div style="background:white;padding:40px;border:1px solid #E8E4DC;">
              <h2 style="font-family:Georgia,serif;color:#2D3748;font-weight:400;font-size:22px;margin:0 0 16px;">Hi ${name},</h2>
              <p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 24px;">
                Congratulations — you've been invited to a <strong style="color:#2D3748;">live video interview</strong> for the
                <strong style="color:#2D3748;">${job_title}</strong> position
                ${company_name ? `at <strong style="color:#2D3748;">${company_name}</strong>` : ''}.
              </p>
              <p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 24px;">
                When your interviewer is ready, click the link below to join the call directly in your browser — no app download required.
              </p>
              <div style="text-align:center;margin:32px 0;">
                <a href="${link}" style="background:#B8924A;color:white;padding:14px 40px;text-decoration:none;font-family:monospace;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;display:inline-block;">JOIN LIVE INTERVIEW →</a>
              </div>
              <div style="background:#F8F7F4;border:1px solid #E8E4DC;border-left:4px solid #B8924A;padding:16px 20px;margin:24px 0;">
                <p style="margin:0 0 6px;color:#6B7280;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-family:monospace;">Your interview link</p>
                <a href="${link}" style="color:#B8924A;font-size:13px;word-break:break-all;">${link}</a>
              </div>
              <p style="color:#9CA3AF;font-size:13px;line-height:1.6;margin:24px 0 0;padding-top:24px;border-top:1px solid #E8E4DC;">
                Ensure you are in a quiet, well-lit space with your camera and microphone ready. The interviewer will join when scheduled.
              </p>
            </div>
            <p style="text-align:center;color:#9CA3AF;font-size:11px;margin-top:24px;letter-spacing:0.08em;">ONE SELECT — STRATEGIC TALENT SOLUTIONS</p>
          </div>
        `,
    }, 'send-live-interview-invite', email)
    return new Response(JSON.stringify({ success: emailSent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('send-live-interview-invite error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
