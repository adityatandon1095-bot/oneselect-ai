import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const resendKey = Deno.env.get('RESEND_API_KEY') ?? ''
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

    const { data: clients } = await supabase
      .from('profiles')
      .select('id, email, full_name, company_name')
      .eq('user_role', 'client')

    if (!clients?.length) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let sent = 0

    for (const client of clients) {
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, title, status')
        .eq('recruiter_id', client.id)
        .eq('status', 'active')

      if (!jobs?.length) continue

      const jobIds = jobs.map((j: { id: string }) => j.id)

      const [{ data: candidates }, { data: matches }] = await Promise.all([
        supabase.from('candidates').select('id, match_pass, scores, live_interview_status, final_decision').in('job_id', jobIds),
        supabase.from('job_matches').select('id, match_pass, scores, live_interview_status, final_decision').in('job_id', jobIds),
      ])

      const all = [...(candidates ?? []), ...(matches ?? [])]
      const total = all.length
      const passed = all.filter((c: { match_pass: boolean }) => c.match_pass === true).length
      const videoComp = all.filter((c: { scores?: { overallScore?: number }; video_urls?: string[] }) => c.scores?.overallScore != null).length
      const liveSched = all.filter((c: { live_interview_status?: string }) =>
        c.live_interview_status === 'scheduled' || c.live_interview_status === 'completed'
      ).length
      const hired = all.filter((c: { final_decision?: string }) => c.final_decision === 'hired').length

      const jobNames = jobs.map((j: { title: string }) => j.title).join(', ')

      let summary = ''
      try {
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 300,
            messages: [{
              role: 'user',
              content: `Write a brief, professional weekly pipeline update for ${client.company_name || client.full_name}.
Active roles: ${jobNames}
Stats: ${total} CVs reviewed, ${passed} passed AI screening (${total ? Math.round(passed / total * 100) : 0}% pass rate), ${videoComp} video interviews completed, ${liveSched} live interviews scheduled or completed, ${hired} offers extended.
Write 2-3 short paragraphs. Professional but warm. No bullet points. No greeting or sign-off.`,
            }],
          }),
        })
        const aiData = await aiRes.json()
        summary = aiData.content?.[0]?.text ?? ''
      } catch (_) {
        summary = `Your hiring pipeline currently has ${total} candidates across ${jobs.length} active role${jobs.length !== 1 ? 's' : ''}. ${passed} candidates have passed AI screening and ${videoComp} video interviews have been completed. We look forward to updating you as the process progresses.`
      }

      const statsRows = [
        ['CVs in Pipeline', total],
        ['Screening Pass', passed],
        ['Video Interviews', videoComp],
        ['Live Interviews', liveSched],
        ['Offers Extended', hired],
      ].map(([label, val]) => `
        <tr>
          <td style="padding:6px 0;color:#6B7280;font-size:13px;border-bottom:1px solid #F3F0E8;">${label}</td>
          <td style="padding:6px 0;text-align:right;font-family:monospace;font-weight:600;color:#2D3748;font-size:15px;border-bottom:1px solid #F3F0E8;">${val}</td>
        </tr>
      `).join('')

      const html = `
        <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#F8F7F4;padding:40px;">
          <div style="text-align:center;padding:32px 0;border-bottom:1px solid #E8E4DC;margin-bottom:32px;">
            <h1 style="font-family:Georgia,serif;color:#B8924A;font-weight:300;letter-spacing:0.15em;font-size:28px;margin:0;">ONE SELECT</h1>
            <p style="color:#9CA3AF;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin:8px 0 0;">Weekly Pipeline Update</p>
          </div>
          <div style="background:white;padding:40px;border:1px solid #E8E4DC;">
            <h2 style="font-family:Georgia,serif;color:#2D3748;font-weight:400;font-size:20px;margin:0 0 24px;">Hi ${client.full_name ?? client.email},</h2>
            ${summary.split('\n\n').filter(Boolean).map(p => `<p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 18px;">${p.trim()}</p>`).join('')}
            <div style="background:#F8F7F4;border:1px solid #E8E4DC;border-radius:8px;padding:24px;margin:24px 0;">
              <h3 style="font-family:monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#9CA3AF;margin:0 0 16px;">Pipeline Summary · ${jobNames}</h3>
              <table style="width:100%;border-collapse:collapse;">${statsRows}</table>
            </div>
          </div>
          <p style="text-align:center;color:#9CA3AF;font-size:11px;margin-top:24px;letter-spacing:0.08em;">ONE SELECT — STRATEGIC TALENT SOLUTIONS</p>
        </div>
      `

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + resendKey },
        body: JSON.stringify({
          from: 'One Select <noreply@oneselect.ai>',
          to: [client.email],
          subject: `Weekly Hiring Update — ${jobNames}`,
          html,
        }),
      })

      sent++
    }

    return new Response(JSON.stringify({ sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('weekly-client-update error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
