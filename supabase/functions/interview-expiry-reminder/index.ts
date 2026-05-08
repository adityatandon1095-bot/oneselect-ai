import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const resendKey   = Deno.env.get('RESEND_API_KEY') ?? ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const appUrl      = Deno.env.get('APP_URL') ?? 'https://oneselect.ai'

  const admin = createClient(supabaseUrl, serviceKey)

  // Find candidates whose interview token expires in the next 48 hours
  // and who have not yet submitted (no video_urls) and have not been reminded
  const now       = new Date()
  const in48h     = new Date(now.getTime() + 48 * 60 * 60 * 1000)

  const { data: expiring, error } = await admin
    .from('candidates')
    .select('id, full_name, email, interview_invite_token, interview_token_expires_at, jobs(title)')
    .not('interview_invite_token', 'is', null)
    .not('interview_token_expires_at', 'is', null)
    .gt('interview_token_expires_at', now.toISOString())
    .lte('interview_token_expires_at', in48h.toISOString())
    .is('interview_expiry_reminder_sent_at', null)
    .or('video_urls.is.null,video_urls.eq.[]')

  if (error) {
    console.error('[interview-expiry-reminder] query error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!expiring?.length) {
    return new Response(JSON.stringify({ reminded: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let reminded = 0
  for (const c of expiring) {
    if (!c.email) continue

    const job   = c.jobs as { title: string } | null
    const role  = job?.title ?? 'the position'
    const token = c.interview_invite_token
    const expiresAt = new Date(c.interview_token_expires_at)
    const expiryStr = expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    const interviewUrl = `${appUrl}/interview/${token}`

    const html = `
      <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#F8F7F4;padding:40px;">
        <div style="text-align:center;padding:24px 0;border-bottom:1px solid #E8E4DC;margin-bottom:32px;">
          <h1 style="font-family:Georgia,serif;color:#B8924A;font-weight:300;letter-spacing:0.15em;font-size:26px;margin:0;">ONE SELECT</h1>
        </div>
        <div style="background:white;padding:40px;border:1px solid #E8E4DC;">
          <h2 style="font-family:Georgia,serif;color:#2D3748;font-weight:400;font-size:20px;margin:0 0 16px;">Hi ${c.full_name},</h2>
          <p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 16px;">
            Just a reminder — your video interview for <strong style="color:#2D3748;">${role}</strong> is still waiting for you.
          </p>
          <p style="color:#EF4444;font-weight:600;font-size:14px;margin:0 0 24px;">
            ⏰ Your interview link expires on ${expiryStr}.
          </p>
          <p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 28px;">
            It only takes about 10 minutes. Click the button below to complete your interview before the link expires.
          </p>
          <a href="${interviewUrl}" style="background:#B8924A;color:white;padding:14px 36px;text-decoration:none;font-family:monospace;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;display:inline-block;margin-bottom:24px;">Start My Interview →</a>
          <p style="color:#9CA3AF;font-size:12px;margin:0;line-height:1.6;">
            If you have any issues, reply to this email or contact us at <a href="mailto:candidates@oneselect.co.uk" style="color:#B8924A;">candidates@oneselect.co.uk</a>
          </p>
        </div>
        <p style="text-align:center;color:#9CA3AF;font-size:11px;margin-top:24px;">ONE SELECT — STRATEGIC TALENT SOLUTIONS</p>
      </div>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
      body: JSON.stringify({
        from:    'One Select <noreply@oneselect.ai>',
        to:      [c.email],
        subject: `Reminder: complete your interview for ${role}`,
        html,
      }),
    })

    if (res.ok) {
      await admin
        .from('candidates')
        .update({ interview_expiry_reminder_sent_at: new Date().toISOString() })
        .eq('id', c.id)
      reminded++
    } else {
      console.error(`[interview-expiry-reminder] email failed for ${c.email}:`, await res.text())
    }
  }

  return new Response(JSON.stringify({ reminded }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
