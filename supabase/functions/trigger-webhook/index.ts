import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
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

    const { jobId, candidateId, candidateName, candidateEmail, jobTitle, decision } = await req.json()
    if (!jobId) {
      return new Response(JSON.stringify({ error: 'jobId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Look up the client's webhook URL via the job's owner (recruiter_id is the client user id)
    const { data: job } = await admin.from('jobs').select('recruiter_id, title').eq('id', jobId).single()
    if (!job) {
      return new Response(JSON.stringify({ skipped: true, reason: 'job not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

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

    const payload = {
      event:          'candidate.hired',
      timestamp:      new Date().toISOString(),
      job_id:         jobId,
      job_title:      jobTitle ?? job.title,
      candidate_id:   candidateId,
      candidate_name: candidateName,
      candidate_email:candidateEmail,
      decision,
      source:         'oneselect',
    }

    let delivered = false
    let deliveryError = ''
    try {
      const webhookRes = await fetch(clientProfile.webhook_url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-OneSelect-Event': 'candidate.hired' },
        body:    JSON.stringify(payload),
        signal:  AbortSignal.timeout(8000),
      })
      delivered = webhookRes.ok
      if (!webhookRes.ok) deliveryError = `HTTP ${webhookRes.status}`
    } catch (fetchErr) {
      deliveryError = String(fetchErr)
    }

    if (!delivered) {
      await admin.from('webhook_failures').insert({
        job_id:        jobId,
        candidate_id:  candidateId,
        error_message: deliveryError,
        payload,
      }).catch(e => console.error('Failed to log webhook failure:', e))
    }

    return new Response(JSON.stringify({ delivered, error: deliveryError || null }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('trigger-webhook error:', err)
    return new Response(JSON.stringify({ delivered: false, error: String(err) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
