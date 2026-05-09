import { FROM_EMAIL } from "../_shared/email.ts"
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

async function fireWithRetry(url: string, payload: object, maxAttempts = 3): Promise<{ success: boolean; attempt: number; error?: string }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-OneSelect-Event': 'candidate.hired' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) return { success: true, attempt }
      throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      if (attempt === maxAttempts) return { success: false, attempt, error: (err as Error).message }
      await new Promise(r => setTimeout(r, 1000 * 2 ** (attempt - 1)))
    }
  }
  return { success: false, attempt: maxAttempts, error: 'unreachable' }
}

async function sendAlertEmail(resendKey: string, opts: {
  companyName: string; candidateName: string; jobTitle: string; webhookUrl: string; errorMsg: string
}) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: ['noreply@oneselect.co.uk'],
      subject: `⚠ Webhook delivery failed — ${opts.companyName}`,
      html: `
        <div style="font-family:monospace;max-width:600px;margin:0 auto;padding:32px;background:#F8F7F4;">
          <h2 style="color:#B8924A;margin:0 0 24px;">Webhook Delivery Failed</h2>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tr><td style="padding:8px 0;color:#6B7280;width:140px;">Client</td><td style="padding:8px 0;font-weight:600;">${opts.companyName}</td></tr>
            <tr><td style="padding:8px 0;color:#6B7280;">Candidate</td><td style="padding:8px 0;">${opts.candidateName}</td></tr>
            <tr><td style="padding:8px 0;color:#6B7280;">Job</td><td style="padding:8px 0;">${opts.jobTitle}</td></tr>
            <tr><td style="padding:8px 0;color:#6B7280;">Webhook URL</td><td style="padding:8px 0;word-break:break-all;color:#DC2626;">${opts.webhookUrl}</td></tr>
            <tr><td style="padding:8px 0;color:#6B7280;">Error</td><td style="padding:8px 0;color:#DC2626;">${opts.errorMsg}</td></tr>
          </table>
          <p style="margin-top:24px;font-size:12px;color:#9CA3AF;">All 3 delivery attempts failed. Check the client's webhook configuration.</p>
        </div>
      `,
    }),
  }).catch(e => console.error('alert email error:', e))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const resendKey   = Deno.env.get('RESEND_API_KEY') ?? ''
    const admin       = createClient(supabaseUrl, serviceKey)

    // Require authenticated caller
    const anonKey    = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { jobId, candidateId } = await req.json()
    if (!jobId) {
      return new Response(JSON.stringify({ error: 'jobId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Fetch all data in parallel ───────────────────────────────────────────

    const [jobResult, candidateResult] = await Promise.all([
      admin.from('jobs').select('id, title, required_skills, experience_years, recruiter_id').eq('id', jobId).single(),
      candidateId
        ? admin.from('candidates').select('id, full_name, email, phone, linkedin_url, match_score, scores').eq('id', candidateId).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const job = jobResult.data
    if (!job) {
      return new Response(JSON.stringify({ skipped: true, reason: 'job not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // If not in candidates table, try job_matches (talent pool path)
    let candidate = candidateResult.data
    let candidateDbId: string | null = candidate?.id ?? null
    if (!candidate && candidateId) {
      const { data: match } = await admin
        .from('job_matches')
        .select('id, match_score, scores, talent_pool(full_name, email, phone, linkedin_url)')
        .eq('id', candidateId)
        .maybeSingle()
      if (match) {
        const tp = match.talent_pool as any
        candidate = {
          id:           match.id,
          full_name:    tp?.full_name    ?? null,
          email:        tp?.email        ?? null,
          phone:        tp?.phone        ?? null,
          linkedin_url: tp?.linkedin_url ?? null,
          match_score:  match.match_score,
          scores:       match.scores,
        }
        // don't set candidateDbId — it's a job_match id, not a candidates id
        candidateDbId = null
      }
    }

    // Fetch client profile
    const { data: clientProfile } = await admin
      .from('profiles')
      .select('webhook_url, company_name')
      .eq('id', job.recruiter_id)
      .single()

    if (!clientProfile?.webhook_url) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no webhook configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Build enriched payload ───────────────────────────────────────────────

    const scores = candidate?.scores ?? {}
    const payload = {
      event:     'candidate.hired',
      timestamp: new Date().toISOString(),
      candidate: {
        name:         candidate?.full_name    ?? null,
        email:        candidate?.email        ?? null,
        phone:        candidate?.phone        ?? null,
        linkedin_url: candidate?.linkedin_url ?? null,
      },
      job: {
        id:               job.id,
        title:            job.title,
        required_skills:  job.required_skills  ?? [],
        experience_years: job.experience_years ?? null,
      },
      assessment: {
        match_score:      candidate?.match_score           ?? null,
        interview_score:  scores?.overallScore             ?? null,
        recommendation:   scores?.recommendation           ?? null,
      },
      client: {
        company_name: clientProfile.company_name ?? null,
      },
      meta: {
        platform: 'oneselect',
        version:  '1.0',
      },
    }

    // ── Fire with retry ──────────────────────────────────────────────────────

    const result = await fireWithRetry(clientProfile.webhook_url, payload)

    // ── Log to webhook_logs ──────────────────────────────────────────────────

    await admin.from('webhook_logs').insert({
      client_id:     job.recruiter_id,
      candidate_id:  candidateDbId,
      webhook_url:   clientProfile.webhook_url,
      payload,
      success:       result.success,
      attempts:      result.attempt,
      error_message: result.error ?? null,
    }).catch(e => console.error('webhook_logs insert error:', e))

    // ── Alert on permanent failure ───────────────────────────────────────────

    if (!result.success && resendKey) {
      await sendAlertEmail(resendKey, {
        companyName:   clientProfile.company_name ?? 'Unknown client',
        candidateName: candidate?.full_name        ?? 'Unknown candidate',
        jobTitle:      job.title                   ?? 'Unknown job',
        webhookUrl:    clientProfile.webhook_url,
        errorMsg:      result.error                ?? 'Unknown error',
      })
    }

    return new Response(JSON.stringify({ delivered: result.success, attempts: result.attempt, error: result.error ?? null }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('trigger-webhook error:', err)
    return new Response(JSON.stringify({ delivered: false, error: String(err) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
