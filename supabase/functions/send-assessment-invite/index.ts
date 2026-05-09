import { FROM_EMAIL } from "../_shared/email.ts"
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { email, name, jobTitle, assessmentUrl } = await req.json()
    const resendKey = Deno.env.get('RESEND_API_KEY') ?? ''

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: `Written assessment — ${jobTitle}`,
        html: `
          <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#F8F7F4;padding:40px;">
            <div style="text-align:center;padding:32px 0;border-bottom:1px solid #E8E4DC;margin-bottom:32px;">
              <h1 style="font-family:Georgia,serif;color:#B8924A;font-weight:300;letter-spacing:0.15em;font-size:28px;margin:0;">ONE SELECT</h1>
              <p style="color:#9CA3AF;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin:8px 0 0;">Strategic Talent Solutions</p>
            </div>
            <div style="background:white;padding:40px;border:1px solid #E8E4DC;">
              <h2 style="font-family:Georgia,serif;color:#2D3748;font-weight:400;font-size:22px;margin:0 0 16px;">Hi ${name},</h2>
              <p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 24px;">
                As part of your application for <strong style="color:#2D3748;">${jobTitle}</strong>, we'd like you to complete a short written assessment. This helps us understand your thinking and how you'd approach relevant challenges.
              </p>
              <p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 8px;">What to expect:</p>
              <ul style="color:#6B7280;font-size:14px;line-height:1.9;margin:0 0 24px;padding-left:20px;">
                <li>3–5 written questions</li>
                <li>No time limit — take as long as you need</li>
                <li>This link is single-use and expires in 72 hours</li>
              </ul>
              <div style="text-align:center;margin:32px 0;">
                <a href="${assessmentUrl}" style="background:#B8924A;color:white;padding:14px 40px;text-decoration:none;font-family:monospace;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;display:inline-block;">START ASSESSMENT →</a>
              </div>
              <div style="background:#F8F7F4;border:1px solid #E8E4DC;border-left:4px solid #B8924A;padding:16px 20px;margin:24px 0;">
                <p style="margin:0 0 6px;color:#6B7280;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-family:monospace;">Your private link</p>
                <a href="${assessmentUrl}" style="color:#B8924A;font-size:13px;word-break:break-all;">${assessmentUrl}</a>
              </div>
              <p style="color:#9CA3AF;font-size:13px;line-height:1.6;margin:24px 0 0;padding-top:24px;border-top:1px solid #E8E4DC;">
                This link is unique to you and can only be used once. If you have any issues, please reply to this email.
              </p>
            </div>
            <p style="text-align:center;color:#9CA3AF;font-size:11px;margin-top:24px;letter-spacing:0.08em;">ONE SELECT — STRATEGIC TALENT SOLUTIONS</p>
          </div>
        `,
      }),
    })

    const ok = res.ok
    return new Response(JSON.stringify({ success: ok }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-assessment-invite error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
