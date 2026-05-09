import { FROM_EMAIL } from "../_shared/email.ts"
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from "../_shared/cors.ts"

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const resendKey  = Deno.env.get('RESEND_API_KEY') ?? ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const admin = createClient(supabaseUrl, serviceKey)

  // Find candidates awaiting client approval for >48 hours who haven't been nudged yet
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const { data: stale, error } = await admin
    .from('candidates')
    .select('id, full_name, job_id, jobs(title, recruiter_id, profiles(email, contact_name, company_name))')
    .eq('match_pass', true)
    .is('client_approved', null)
    .is('client_approval_nudge_sent_at', null)
    .lt('created_at', cutoff)

  if (error) {
    console.error('client-approval-nudge query error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  if (!stale?.length) {
    return new Response(JSON.stringify({ nudged: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Group by recruiter so we send one email per recruiter
  const byRecruiter = new Map<string, { email: string; name: string; company: string; candidates: { name: string; job: string }[] }>()
  for (const c of stale) {
    const job     = c.jobs as { title: string; recruiter_id: string; profiles: { email: string; contact_name: string; company_name: string } } | null
    const profile = job?.profiles
    if (!job || !profile?.email) continue
    const key = job.recruiter_id
    if (!byRecruiter.has(key)) {
      byRecruiter.set(key, { email: profile.email, name: profile.contact_name ?? profile.email, company: profile.company_name ?? '', candidates: [] })
    }
    byRecruiter.get(key)!.candidates.push({ name: c.full_name, job: job.title })
  }

  let nudged = 0
  for (const [, { email, name, company, candidates }] of byRecruiter) {
    const list = candidates.map(c => `• ${c.name} — ${c.job}`).join('\n')
    const payload = {
      from: FROM_EMAIL,
      to: [email],
      subject: `Action required: ${candidates.length} candidate${candidates.length !== 1 ? 's' : ''} awaiting client approval`,
      text: `Hi ${name},\n\nThe following candidate${candidates.length !== 1 ? 's have' : ' has'} been waiting for client approval for more than 48 hours:\n\n${list}\n\nPlease log in and follow up with your client to keep the pipeline moving.\n\nOne Select`,
      html: `<p>Hi ${name},</p><p>The following candidate${candidates.length !== 1 ? 's have' : ' has'} been waiting for <strong>client approval for more than 48 hours</strong>:</p><ul>${candidates.map(c => `<li><strong>${c.name}</strong> — ${c.job}</li>`).join('')}</ul><p>Please log in and follow up with your client to keep the pipeline moving.</p><p style="color:#9CA3AF;font-size:12px">One Select · Strategic Talent Solutions</p>`,
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
      body: JSON.stringify(payload),
    })
    if (res.ok) nudged++
    else console.error('client-approval-nudge email failed for', email, await res.text())
  }

  // Mark all nudged candidates so we don't re-send
  const nudgedIds = (stale ?? [])
    .filter(c => {
      const job = c.jobs as { recruiter_id: string; profiles: { email: string } | null } | null
      return job?.profiles?.email
    })
    .map(c => c.id)

  if (nudgedIds.length) {
    await admin
      .from('candidates')
      .update({ client_approval_nudge_sent_at: new Date().toISOString() })
      .in('id', nudgedIds)
  }

  return new Response(JSON.stringify({ nudged, candidates: nudgedIds.length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
