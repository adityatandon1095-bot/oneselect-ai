import { FROM_EMAIL } from "../_shared/email.ts"
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

async function sendEmail(resendKey: string, payload: Record<string, unknown>): Promise<boolean> {
  const call = () => fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${resendKey}` },
    body: JSON.stringify(payload),
  })
  try {
    const res = await call()
    if (res.ok) return true
    await new Promise(r => setTimeout(r, 1000))
    return (await call()).ok
  } catch {
    return false
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const resendKey = Deno.env.get("RESEND_API_KEY") ?? ""
  const appUrl    = Deno.env.get("APP_URL") ?? "https://oneselect.ai"
  let reminded = 0

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // Find available candidates who haven't been contacted or re-engaged in 30 days
    const { data: candidates, error } = await supabase
      .from("talent_pool")
      .select("id, full_name, email, candidate_role, skills, match_density, last_contacted_at, reengagement_sent_at")
      .eq("availability", "available")
      .not("email", "is", null)
      .or(`last_contacted_at.is.null,last_contacted_at.lt.${thirtyDaysAgo}`)
      .or(`reengagement_sent_at.is.null,reengagement_sent_at.lt.${thirtyDaysAgo}`)

    if (error) throw new Error("talent_pool query failed: " + error.message)
    if (!candidates?.length) {
      return new Response(JSON.stringify({ success: true, reminded: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const todayUtc = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

    for (const candidate of candidates) {
      if (!candidate.email) continue

      // Idempotency guard: skip if already sent today (protects against double cron fires)
      if (candidate.reengagement_sent_at) {
        const sentDate = candidate.reengagement_sent_at.slice(0, 10)
        if (sentDate === todayUtc) continue
      }

      // Fetch top 3 strong matching jobs for this candidate
      const { data: topMatches } = await supabase
        .from("job_matches")
        .select("match_score, jobs(id, title, location, experience_years, required_skills)")
        .eq("talent_id", candidate.id)
        .eq("match_pass", true)
        .order("match_score", { ascending: false })
        .limit(3)

      const matchedJobs = (topMatches ?? [])
        .map((m: Record<string, unknown>) => m.jobs as { id: string; title: string; location: string | null; experience_years: number | null; required_skills: string[] } | null)
        .filter(Boolean) as { id: string; title: string; location: string | null; experience_years: number | null; required_skills: string[] }[]

      // Build job cards HTML
      const jobCardsHtml = matchedJobs.length > 0
        ? matchedJobs.map(j => `
            <div style="border:1px solid #E8E4DC;padding:16px 20px;margin-bottom:12px;">
              <div style="font-size:15px;font-weight:600;color:#2D3748;margin-bottom:4px;">${j.title}</div>
              ${j.location ? `<div style="font-size:12px;color:#9CA3AF;margin-bottom:6px;">📍 ${j.location}</div>` : ''}
              ${j.experience_years ? `<div style="font-size:12px;color:#6B7280;">${j.experience_years}+ years experience</div>` : ''}
              ${(j.required_skills ?? []).slice(0,4).length > 0
                ? `<div style="margin-top:8px;">${(j.required_skills ?? []).slice(0,4).map(s =>
                    `<span style="font-size:10px;padding:2px 7px;background:#F3F0EA;border:1px solid #E8E4DC;margin-right:4px;font-family:monospace;">${s}</span>`
                  ).join('')}</div>`
                : ''}
              <a href="${appUrl}/jobs" style="display:inline-block;margin-top:10px;font-size:11px;color:#B8924A;font-family:monospace;letter-spacing:0.06em;text-decoration:none;">VIEW & APPLY →</a>
            </div>`).join('')
        : `<div style="padding:16px;background:#F8F7F4;border:1px solid #E8E4DC;color:#6B7280;font-size:13px;">
            New roles are being added regularly. Check our job board for the latest openings.
            <div style="margin-top:10px;"><a href="${appUrl}/jobs" style="color:#B8924A;font-family:monospace;font-size:11px;letter-spacing:0.06em;text-decoration:none;">BROWSE ALL JOBS →</a></div>
           </div>`

      const html = `
        <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#F8F7F4;padding:40px;">
          <div style="text-align:center;padding:24px 0;border-bottom:1px solid #E8E4DC;margin-bottom:32px;">
            <h1 style="font-family:Georgia,serif;color:#B8924A;font-weight:300;letter-spacing:0.15em;font-size:26px;margin:0;">ONE SELECT</h1>
          </div>
          <div style="background:white;padding:40px;border:1px solid #E8E4DC;">
            <h2 style="font-family:Georgia,serif;color:#2D3748;font-weight:400;font-size:20px;margin:0 0 12px;">Hi ${candidate.full_name ?? "there"},</h2>
            <p style="color:#6B7280;line-height:1.8;font-size:15px;margin:0 0 20px;">
              We have new roles that match your profile${candidate.candidate_role ? ` as a <strong style="color:#2D3748;">${candidate.candidate_role}</strong>` : ""}. Our team thought you'd want to know about them.
            </p>
            <div style="font-size:10px;font-family:monospace;text-transform:uppercase;letter-spacing:0.12em;color:#9CA3AF;margin-bottom:12px;">
              ${matchedJobs.length > 0 ? `Top ${matchedJobs.length} match${matchedJobs.length !== 1 ? "es" : ""} for you` : "Latest openings"}
            </div>
            ${jobCardsHtml}
            <div style="margin-top:24px;padding-top:20px;border-top:1px solid #E8E4DC;text-align:center;">
              <a href="${appUrl}/jobs" style="background:#B8924A;color:white;padding:12px 32px;text-decoration:none;font-family:monospace;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;display:inline-block;">
                Browse All Open Roles →
              </a>
            </div>
            <p style="color:#9CA3AF;font-size:12px;margin-top:20px;line-height:1.6;">
              Not looking right now? No problem — you'll only hear from us when there are relevant opportunities. Reply to this email to update your availability.
            </p>
          </div>
          <p style="text-align:center;color:#9CA3AF;font-size:11px;margin-top:24px;">ONE SELECT — STRATEGIC TALENT SOLUTIONS</p>
        </div>`

      const sent = await sendEmail(resendKey, {
        from:    FROM_EMAIL,
        to:      [candidate.email],
        subject: matchedJobs.length > 0
          ? `${matchedJobs.length} new role${matchedJobs.length !== 1 ? "s" : ""} matching your profile — One Select`
          : "New opportunities matching your profile — One Select",
        html,
      })

      if (sent) {
        await supabase
          .from("talent_pool")
          .update({ reengagement_sent_at: new Date().toISOString() })
          .eq("id", candidate.id)
        reminded++
      }
    }

    console.log(`[talent-reengagement] sent ${reminded} emails`)
    return new Response(JSON.stringify({ success: true, reminded }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  } catch (err) {
    console.error("[talent-reengagement]", (err as Error).message)
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
