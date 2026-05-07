import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sendEmail(resendKey: string, payload: Record<string, unknown>, recipient: string) {
  const call = () => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
    body: JSON.stringify(payload),
  })
  try {
    const res = await call()
    if (res.ok) return { ok: true }
    await new Promise(r => setTimeout(r, 1000))
    const retry = await call()
    return { ok: retry.ok }
  } catch {
    await new Promise(r => setTimeout(r, 1000))
    try {
      const retry = await call()
      return { ok: retry.ok }
    } catch (e) {
      console.error('resend-interview-invite email error:', e)
      return { ok: false }
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { token } = await req.json()
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing token' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const resendKey   = Deno.env.get('RESEND_API_KEY') ?? ''
    const appUrl      = 'https://oneselect-ai-t6uo-phi.vercel.app'

    const db = createClient(supabaseUrl, serviceKey)

    let record: { id: string; full_name: string; email: string; interview_token_expires_at: string | null; job_title: string } | null = null
    let table = 'candidates'

    const { data: cRow } = await db
      .from('candidates')
      .select('id, full_name, email, interview_token_expires_at, jobs(title)')
      .eq('interview_invite_token', token)
      .maybeSingle()

    if (cRow) {
      record = {
        id: cRow.id,
        full_name: cRow.full_name ?? '',
        email: cRow.email ?? '',
        interview_token_expires_at: cRow.interview_token_expires_at,
        job_title: (cRow.jobs as any)?.title ?? '',
      }
      table = 'candidates'
    } else {
      const { data: mRow } = await db
        .from('job_matches')
        .select('id, interview_token_expires_at, talent_pool(full_name, email), jobs(title)')
        .eq('interview_invite_token', token)
        .maybeSingle()

      if (mRow) {
        record = {
          id: mRow.id,
          full_name: (mRow.talent_pool as any)?.full_name ?? '',
          email: (mRow.talent_pool as any)?.email ?? '',
          interview_token_expires_at: mRow.interview_token_expires_at,
          job_title: (mRow.jobs as any)?.title ?? '',
        }
        table = 'job_matches'
      }
    }

    if (!record) {
      return new Response(JSON.stringify({ error: 'invalid' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (!record.interview_token_expires_at || new Date(record.interview_token_expires_at) > new Date()) {
      return new Response(JSON.stringify({ error: 'not_expired' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (!record.email) {
      return new Response(JSON.stringify({ error: 'no_email' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const newToken  = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const link      = `${appUrl}/interview/${newToken}`

    await db.from(table).update({ interview_invite_token: newToken, interview_token_expires_at: expiresAt }).eq('id', record.id)

    const { ok } = await sendEmail(resendKey, {
      from: 'One Select <noreply@oneselect.ai>',
      to:   [record.email],
      subject: `Your new interview link — ${record.job_title}`,
      html: `
        <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#F8F7F4;padding:40px;">
          <div style="text-align:center;padding:32px 0;border-bottom:1px solid #E8E4DC;margin-bottom:32px;">
            <h1 style="font-family:Georgia,serif;color:#B8924A;font-weight:300;letter-spacing:0.15em;font-size:28px;margin:0;">ONE SELECT</h1>
            <p style="color:#9CA3AF;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin:8px 0 0;">Strategic Talent Solutions</p>
          </div>
          <div style="background:white;padding:40px;border:1px solid #E8E4DC;">
            <h2 style="font-family:Georgia,serif;color:#2D3748;font-weight:400;font-size:22px;margin:0 0 16px;">Hi ${record.full_name},</h2>
            <p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 24px;">
              Your previous interview link expired, so we've sent you a fresh one. Your invitation for the
              <strong style="color:#2D3748;">${record.job_title}</strong> position is still open.
            </p>
            <div style="text-align:center;margin:32px 0;">
              <a href="${link}" style="background:#B8924A;color:white;padding:14px 40px;text-decoration:none;font-family:monospace;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;display:inline-block;">START VIDEO INTERVIEW →</a>
            </div>
            <div style="background:#F8F7F4;border:1px solid #E8E4DC;border-left:4px solid #B8924A;padding:16px 20px;margin:24px 0;">
              <p style="margin:0 0 6px;color:#6B7280;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-family:monospace;">Your private link</p>
              <a href="${link}" style="color:#B8924A;font-size:13px;word-break:break-all;">${link}</a>
            </div>
            <p style="color:#9CA3AF;font-size:13px;line-height:1.6;margin:24px 0 0;padding-top:24px;border-top:1px solid #E8E4DC;">
              This link expires in 7 days. The interview consists of 5 questions (90–120 seconds each). Find a quiet, well-lit space before you begin.
            </p>
          </div>
          <p style="text-align:center;color:#9CA3AF;font-size:11px;margin-top:24px;letter-spacing:0.08em;">ONE SELECT — STRATEGIC TALENT SOLUTIONS</p>
        </div>
      `,
    }, record.email)

    return new Response(JSON.stringify({ success: ok }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('resend-interview-invite error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
