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
    const { to_email, to_name, subject, body, job_title } = await req.json()
    const resendKey = Deno.env.get('RESEND_API_KEY') ?? ''

    const paragraphs = (body as string)
      .split('\n')
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => `<p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 16px;">${p}</p>`)
      .join('')

    const html = `
      <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#F8F7F4;padding:40px;">
        <div style="text-align:center;padding:32px 0;border-bottom:1px solid #E8E4DC;margin-bottom:32px;">
          <h1 style="font-family:Georgia,serif;color:#B8924A;font-weight:300;letter-spacing:0.15em;font-size:28px;margin:0;">ONE SELECT</h1>
          <p style="color:#9CA3AF;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin:8px 0 0;">Strategic Talent Solutions</p>
        </div>
        <div style="background:white;padding:40px;border:1px solid #E8E4DC;">
          ${paragraphs}
        </div>
        <p style="text-align:center;color:#9CA3AF;font-size:11px;margin-top:24px;letter-spacing:0.08em;">ONE SELECT — STRATEGIC TALENT SOLUTIONS</p>
      </div>
    `

    const { ok: emailSent } = await sendEmail(resendKey, {
      from: 'One Select <noreply@oneselect.ai>',
      to: [to_email],
      subject,
      html,
    }, 'send-outreach-email', to_email)
    return new Response(JSON.stringify({ success: emailSent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-outreach-email error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
