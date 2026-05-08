import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const NETROWS_BASE   = "https://api.netrows.com/api/v1/linkedin"
const ANTHROPIC_API  = "https://api.anthropic.com/v1/messages"
const CLAUDE_MODEL   = "claude-sonnet-4-6"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

// ---------- profile helpers ----------

function estimateYears(experience: unknown[]): number | null {
  if (!Array.isArray(experience) || experience.length === 0) return null
  let total = 0
  for (const exp of experience) {
    const e = exp as Record<string, string | null>
    const start = e.start_date ? new Date(e.start_date) : null
    const end   = e.end_date   ? new Date(e.end_date)   : new Date()
    if (start && !isNaN(start.getTime())) {
      total += Math.max(0, (end.getTime() - start.getTime()) / (365.25 * 24 * 3600 * 1000))
    }
  }
  return total > 0 ? Math.round(total) : null
}

function formatEducation(education: unknown[]): string {
  if (!Array.isArray(education) || education.length === 0) return ""
  const e = education[0] as Record<string, string>
  return [e.degree, e.field, e.school].filter(Boolean).join(", ")
}

function extractCurrentRole(experience: unknown[]): { role: string; company: string } {
  if (!Array.isArray(experience) || experience.length === 0) return { role: "", company: "" }
  const sorted = [...experience].sort((a, b) => {
    const ea = a as Record<string, string | null>
    const eb = b as Record<string, string | null>
    if (!ea.end_date && eb.end_date) return -1
    if (ea.end_date && !eb.end_date) return 1
    return 0
  })
  const cur = sorted[0] as Record<string, string>
  return { role: cur.title ?? "", company: cur.company ?? "" }
}

// ---------- Claude helpers ----------

async function callClaude(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number
): Promise<string> {
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`Claude API error (${res.status}): ${errText}`)
  }
  const json = await res.json()
  return json.content?.[0]?.text ?? ""
}

function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text.replace(/```(?:json)?\n?|\n?```/g, "").trim())
  } catch {
    return fallback
  }
}

interface SearchIntent {
  search_keywords:   string
  must_have_skills:  string[]
  nice_to_have_skills: string[]
  seniority:         string
  industry_context:  string
}

async function extractSearchIntent(
  apiKey: string,
  jobTitle: string,
  jobDescription: string,
  skills: string[]
): Promise<SearchIntent> {
  const fallback: SearchIntent = {
    search_keywords:    [jobTitle, ...skills.slice(0, 2)].filter(Boolean).join(" "),
    must_have_skills:   skills.slice(0, 3),
    nice_to_have_skills: [],
    seniority:          "mid",
    industry_context:   "",
  }
  if (!apiKey) return fallback

  const text = await callClaude(
    apiKey,
    `You are a technical recruiter. Extract LinkedIn search intent from a job description.
Respond with valid JSON only — no markdown, no explanation.`,
    `Job Title: ${jobTitle}
Skills mentioned: ${skills.join(", ")}
Job Description:
${(jobDescription || "").slice(0, 2000)}

Return JSON:
{
  "search_keywords": "<2-6 word query optimised for LinkedIn search — title + core tech stack>",
  "must_have_skills": ["skill1", "skill2"],
  "nice_to_have_skills": ["skill3"],
  "seniority": "<junior|mid|senior|lead|principal>",
  "industry_context": "<brief domain context, one phrase>"
}`,
    500
  )
  return parseJson<SearchIntent>(text, fallback)
}

interface ProfileScore {
  score:  number
  reason: string
}

async function scoreProfile(
  apiKey: string,
  profile: Record<string, unknown>,
  jobTitle: string,
  jobDescription: string,
  intent: SearchIntent
): Promise<ProfileScore> {
  const fallback: ProfileScore = { score: 5, reason: "Could not score profile" }
  if (!apiKey) return fallback

  const profileSummary = {
    headline:   profile.headline,
    skills:     (profile.skills as string[] | null)?.slice(0, 15) ?? [],
    experience: (profile.experience as unknown[] | null)?.slice(0, 3) ?? [],
    education:  (profile.education as unknown[] | null)?.[0] ?? null,
    about:      ((profile.summary as string | null) ?? (profile.about as string | null) ?? "").slice(0, 300),
  }

  const text = await callClaude(
    apiKey,
    `You are a technical recruiter scoring LinkedIn profiles against job requirements.
Respond with valid JSON only: {"score": <integer 1-10>, "reason": "<one concise sentence>"}
No markdown, no explanation.`,
    `Job: ${jobTitle}
Must-have: ${intent.must_have_skills.join(", ")}
Nice-to-have: ${intent.nice_to_have_skills.join(", ")}
Seniority: ${intent.seniority}
JD excerpt: ${(jobDescription || "").slice(0, 500)}

Candidate:
${JSON.stringify(profileSummary)}

Score 1-10. Rubric: 7-10 = strong fit → pipeline, 4-6 = partial fit → talent pool, 1-3 = poor fit → discard.`,
    200
  )
  const parsed = parseJson<Partial<ProfileScore>>(text, {})
  return {
    score:  Math.min(10, Math.max(1, Number(parsed.score) || 5)),
    reason: parsed.reason || "No reason provided",
  }
}

// ---------- log helper ----------

async function insertLog(row: {
  job_id:           string | null
  candidates_found: number
  candidates_added: number
  status:           "success" | "failed"
  error_message:    string | null
}) {
  await supabase.from("linkedin_sourcing_log").insert(row).catch(() => {})
}

// ---------- main handler ----------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const logRow = {
    job_id:           null as string | null,
    candidates_found: 0,
    candidates_added: 0,
    status:           "failed" as "success" | "failed",
    error_message:    null as string | null,
  }

  try {
    const body = await req.json()
    const {
      job_id,
      job_title,
      job_description = "",
      skills          = [],
      location        = "India",
      experience_level = "",
    } = body

    if (!job_id || !job_title) throw new Error("job_id and job_title are required")
    logRow.job_id = job_id

    // Resolve Netrows key — env var takes priority, then platform_settings
    let netrowsKey = Deno.env.get("NETROWS_API_KEY") ?? ""
    if (!netrowsKey) {
      const { data: s } = await supabase
        .from("platform_settings").select("value").eq("key", "netrows_api_key").single()
      netrowsKey = s?.value ?? ""
    }
    if (!netrowsKey) throw new Error("NETROWS_API_KEY not configured")

    // Resolve Anthropic key
    let anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? ""
    if (!anthropicKey) {
      const { data: s } = await supabase
        .from("platform_settings").select("value").eq("key", "anthropic_api_key").single()
      anthropicKey = s?.value ?? ""
    }

    // Check sourcing enabled
    const { data: enabledSetting } = await supabase
      .from("platform_settings").select("value").eq("key", "linkedin_sourcing_enabled").single()
    if (enabledSetting?.value === "false") {
      await insertLog({ ...logRow, status: "failed", error_message: "LinkedIn sourcing is disabled" })
      return new Response(JSON.stringify({ success: false, reason: "disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Read max profiles cap
    const { data: maxSetting } = await supabase
      .from("platform_settings").select("value").eq("key", "linkedin_max_profiles").single()
    const maxProfiles = Math.min(Number(maxSetting?.value ?? "20") || 20, 50)

    // ---- Part A: extract intelligent search intent from JD via Claude ----
    const intent = await extractSearchIntent(
      anthropicKey,
      job_title,
      job_description,
      skills as string[]
    )

    // ---- Part B: Netrows search using Claude's extracted keywords ----
    const searchUrl = new URL(`${NETROWS_BASE}/person/search`)
    searchUrl.searchParams.set("keywords", intent.search_keywords)
    searchUrl.searchParams.set("location",  "India")
    searchUrl.searchParams.set("title",     job_title)
    searchUrl.searchParams.set("limit",     String(maxProfiles))

    const searchRes = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${netrowsKey}` },
    })
    if (!searchRes.ok) {
      const errText = await searchRes.text().catch(() => searchRes.statusText)
      throw new Error(`Netrows search failed (${searchRes.status}): ${errText}`)
    }

    const searchJson = await searchRes.json()
    const profiles: Array<Record<string, unknown>> =
      searchJson.data ?? searchJson.results ?? []

    logRow.candidates_found = profiles.length

    if (profiles.length === 0) {
      await insertLog({ ...logRow, status: "success" })
      return new Response(
        JSON.stringify({ success: true, candidates_added: 0, talent_pool_added: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // ---- Part C+D: fetch full profile, score, route by score ----
    let candidatesAdded = 0
    let talentPoolAdded = 0

    for (const p of profiles) {
      const linkedinUrl = ((p.linkedin_url ?? p.profile_url ?? "") as string).trim()
      if (!linkedinUrl) continue

      // Fetch enriched profile from Netrows
      let profile: Record<string, unknown> = p
      try {
        const profileUrl = new URL(`${NETROWS_BASE}/person/profile`)
        profileUrl.searchParams.set("linkedin_url", linkedinUrl)
        const profileRes = await fetch(profileUrl.toString(), {
          headers: { Authorization: `Bearer ${netrowsKey}` },
        })
        if (profileRes.ok) {
          const profileJson = await profileRes.json()
          profile = profileJson.data ?? profileJson ?? p
        }
      } catch { /* fall back to search result data */ }

      // Part C: Claude scores this profile against the JD
      const { score, reason } = await scoreProfile(
        anthropicKey, profile, job_title, job_description, intent
      )

      // Score < 4: discard
      if (score < 4) continue

      // Score 7+: job pipeline (job_id set); 4-6: talent pool (job_id null)
      const isJobPipeline = score >= 7
      const targetJobId   = isJobPipeline ? job_id : null

      // Deduplicate — skip if same linkedin_url already exists for this target slot
      let dupQuery = supabase
        .from("candidates")
        .select("id", { count: "exact", head: true })
        .eq("linkedin_url", linkedinUrl)

      if (isJobPipeline) {
        dupQuery = dupQuery.eq("job_id", job_id)
      } else {
        dupQuery = dupQuery.is("job_id", null).eq("source", "linkedin")
      }

      const { count: dupCount } = await dupQuery
      if ((dupCount ?? 0) > 0) continue

      // Map Netrows profile fields to candidates columns
      const fullName   = ((profile.full_name ?? profile.name ?? p.full_name ?? p.name ?? "") as string).trim()
      const headline   = ((profile.headline  ?? p.headline ?? "") as string)
      const summary    = ((profile.summary   ?? profile.about ?? headline) as string)
      const email      = (profile.email ?? null) as string | null
      const skills_    = (profile.skills ?? []) as string[]
      const experience = (profile.experience ?? profile.positions ?? []) as unknown[]
      const education  = (profile.education  ?? []) as unknown[]

      const { role: currentRole, company: currentCompany } = extractCurrentRole(experience)
      const candidateRole = currentRole || headline.split(" at ")[0] || headline
      const totalYears    = estimateYears(experience)
      const educationStr  = formatEducation(education)

      // Enrich linkedin_data with Claude's match score + reason
      const enrichedData = { ...profile, match_score: score, match_reason: reason }

      await supabase.from("candidates").insert({
        job_id:         targetJobId,
        full_name:      fullName || "Unknown",
        email:          email || null,
        candidate_role: candidateRole || job_title,
        total_years:    totalYears,
        skills:         Array.isArray(skills_) ? (skills_ as string[]).slice(0, 20) : [],
        education:      educationStr || null,
        summary:        currentCompany
          ? `${currentCompany}${summary ? " · " + summary : ""}`
          : summary || null,
        linkedin_url:   linkedinUrl,
        linkedin_data:  enrichedData,
        source:         "linkedin",
      })

      if (isJobPipeline) {
        candidatesAdded++
      } else {
        talentPoolAdded++
      }
    }

    logRow.candidates_added = candidatesAdded
    logRow.status = "success"
    await insertLog(logRow)

    return new Response(
      JSON.stringify({ success: true, candidates_added: candidatesAdded, talent_pool_added: talentPoolAdded }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (err) {
    logRow.status = "failed"
    logRow.error_message = (err as Error).message
    await insertLog(logRow).catch(() => {})
    console.error("[source-linkedin-candidates]", (err as Error).message)
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
