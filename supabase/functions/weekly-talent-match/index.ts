import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

// Lightweight skill/experience scorer — no LLM, runs in microseconds per pair.
// Returns 0-100. Threshold for "strong match" (match_pass=true) is 60.
function scoreCandidate(
  candidate: { skills: string[]; total_years: number | null; candidate_role: string },
  job: { required_skills: string[]; preferred_skills: string[]; experience_years: number | null; title: string }
): number {
  let score = 0

  const cSkills = new Set(
    (candidate.skills ?? []).map((s: string) => s.toLowerCase().trim())
  )

  // Required skills overlap → up to 55 pts
  const req = (job.required_skills ?? []).map(s => s.toLowerCase().trim())
  if (req.length > 0) {
    const hits = req.filter(s => cSkills.has(s) || [...cSkills].some(cs => cs.includes(s) || s.includes(cs)))
    score += Math.round((hits.length / req.length) * 55)
  } else {
    score += 20 // no requirements specified — neutral contribution
  }

  // Preferred skills overlap → up to 20 pts
  const pref = (job.preferred_skills ?? []).map(s => s.toLowerCase().trim())
  if (pref.length > 0) {
    const hits = pref.filter(s => cSkills.has(s) || [...cSkills].some(cs => cs.includes(s) || s.includes(cs)))
    score += Math.round((hits.length / pref.length) * 20)
  }

  // Experience match → up to 15 pts
  if (job.experience_years && candidate.total_years != null) {
    if (candidate.total_years >= job.experience_years) {
      score += 15
    } else if (candidate.total_years >= job.experience_years * 0.7) {
      score += 8
    }
  } else if (!job.experience_years) {
    score += 10 // no exp requirement — neutral
  }

  // Title keyword overlap → up to 10 pts
  const roleWords = new Set(
    (candidate.candidate_role ?? "").toLowerCase().split(/\W+/).filter(Boolean)
  )
  const titleWords = (job.title ?? "").toLowerCase().split(/\W+/).filter(Boolean)
  const titleHits = titleWords.filter(w => w.length > 3 && roleWords.has(w))
  if (titleHits.length > 0) score += Math.min(10, titleHits.length * 5)

  return Math.min(100, score)
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const startedAt = new Date().toISOString()
  let totalCandidates = 0
  let totalMatches    = 0
  let totalUpdated    = 0

  try {
    // Fetch all available talent pool candidates
    const { data: candidates, error: cErr } = await supabase
      .from("talent_pool")
      .select("id, full_name, email, skills, total_years, candidate_role")
      .eq("availability", "available")

    if (cErr) throw new Error("talent_pool fetch failed: " + cErr.message)
    if (!candidates?.length) {
      return new Response(JSON.stringify({ success: true, candidates: 0, matches: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    totalCandidates = candidates.length

    // Fetch all active jobs
    const { data: jobs, error: jErr } = await supabase
      .from("jobs")
      .select("id, title, required_skills, preferred_skills, experience_years")
      .eq("status", "active")

    if (jErr) throw new Error("jobs fetch failed: " + jErr.message)
    if (!jobs?.length) {
      return new Response(JSON.stringify({ success: true, candidates: totalCandidates, matches: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const now = new Date().toISOString()

    for (const candidate of candidates) {
      let strongMatchCount = 0

      for (const job of jobs) {
        const score = scoreCandidate(candidate, job)
        if (score < 40) continue // below threshold — skip entirely

        const pass = score >= 60

        // Upsert into job_matches (talent_id + job_id is the unique key)
        const { error: upsertErr } = await supabase
          .from("job_matches")
          .upsert({
            talent_id:    candidate.id,
            job_id:       job.id,
            match_score:  score,
            match_pass:   pass,
            match_reason: pass ? `Strong skill overlap (${score}/100)` : `Partial match (${score}/100)`,
            match_rank:   score >= 80 ? "top10" : score >= 60 ? "strong" : "moderate",
            status:       "matched",
          }, { onConflict: "talent_id,job_id" })

        if (!upsertErr && pass) {
          strongMatchCount++
          totalMatches++
        }
      }

      // Update candidate's match_density and last_matched_at
      const { error: updateErr } = await supabase
        .from("talent_pool")
        .update({ match_density: strongMatchCount, last_matched_at: now })
        .eq("id", candidate.id)

      if (!updateErr) totalUpdated++
    }

    console.log(`[weekly-talent-match] ${totalCandidates} candidates, ${totalMatches} strong matches, ${totalUpdated} updated`)

    return new Response(
      JSON.stringify({ success: true, candidates: totalCandidates, matches: totalMatches, updated: totalUpdated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (err) {
    console.error("[weekly-talent-match]", (err as Error).message)
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
