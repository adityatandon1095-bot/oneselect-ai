import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

const APIFY_RUN_URL  = "https://api.apify.com/v2/acts/harvestapi~linkedin-profile-search/run-sync-get-dataset-items"
const ANTHROPIC_API  = "https://api.anthropic.com/v1/messages"
const CLAUDE_MODEL   = "claude-sonnet-4-6"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

// ---------- mock data (APIFY_MOCK=true) ----------

function mockProfiles(): Array<Record<string, unknown>> {
  return [
    {
      fullName: "Priya Kapoor",
      headline: "Senior Product Manager · Fintech & Payments",
      location: "London, United Kingdom",
      profileUrl: "https://www.linkedin.com/in/priya-kapoor-mock",
      currentCompany: "Revolut",
      skills: ["Product Strategy", "Agile", "SQL", "User Research", "OKRs", "Payments"],
      summary: "9 years in fintech product. Led launch of Revolut Business accounts in APAC. Strong data-driven background.",
      profilePicture: null,
    },
    {
      fullName: "James Osei",
      headline: "Product Manager | B2B SaaS | Data Analytics",
      location: "Manchester, United Kingdom",
      profileUrl: "https://www.linkedin.com/in/james-osei-mock",
      currentCompany: "Sage",
      skills: ["Product Management", "Data Analysis", "Stakeholder Management", "Agile", "JIRA"],
      summary: "6 years building B2B SaaS products. Specialised in analytics dashboards and data workflows.",
      profilePicture: null,
    },
    {
      fullName: "Aisha Nwosu",
      headline: "Lead Product Manager — Growth & Retention",
      location: "London, United Kingdom",
      profileUrl: "https://www.linkedin.com/in/aisha-nwosu-mock",
      currentCompany: "Monzo",
      skills: ["Growth Product", "A/B Testing", "User Research", "Product Analytics", "Team Leadership"],
      summary: "5 years at Monzo. Owned the core growth loop, drove 30% improvement in 90-day retention.",
      profilePicture: null,
    },
    {
      fullName: "Tom Bergmann",
      headline: "Product Manager | Mobile & Consumer Apps",
      location: "Berlin, Germany",
      profileUrl: "https://www.linkedin.com/in/tom-bergmann-mock",
      currentCompany: "Zalando",
      skills: ["Mobile Product", "Agile", "Figma", "Customer Discovery", "Roadmapping"],
      summary: "4 years in consumer mobile product. Led checkout redesign that improved conversion by 18%.",
      profilePicture: null,
    },
    {
      fullName: "Sara Lindqvist",
      headline: "Associate PM · Transitioning from Business Analyst",
      location: "Stockholm, Sweden",
      profileUrl: "https://www.linkedin.com/in/sara-lindqvist-mock",
      currentCompany: "Klarna",
      skills: ["SQL", "Requirements Gathering", "Process Mapping", "Excel", "Stakeholder Interviews"],
      summary: "3 years as BA at Klarna, now moving into product. Strong analytical foundation.",
      profilePicture: null,
    },
  ]
}

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

// Map an Apify profile object to a normalised shape our scoring + insert logic can use.
// All fields default to null so nothing crashes on partial responses.
function mapApifyProfile(p: Record<string, unknown>): Record<string, unknown> {
  return {
    // canonical fields our scoring helpers read
    full_name:       (p.fullName    as string | null)        ?? null,
    headline:        (p.headline    as string | null)        ?? null,
    location:        (p.location    as string | null)        ?? null,
    linkedin_url:    (p.profileUrl  as string | null)        ?? null,
    current_company: (p.currentCompany as string | null)     ?? null,
    skills:          Array.isArray(p.skills) ? p.skills      : [],
    summary:         (p.summary     as string | null)        ?? null,
    bio:             (p.summary     as string | null)        ?? null,
    avatar_url:      (p.profilePicture as string | null)     ?? null,
    // keep original for enrichedData storage
    ...p,
  }
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
  must_have_skills:    string[]
  nice_to_have_skills: string[]
  seniority:           string
  industry_context:    string
}

async function extractSearchIntent(
  apiKey: string,
  jobTitle: string,
  jobDescription: string,
  skills: string[]
): Promise<SearchIntent> {
  const fallback: SearchIntent = {
    must_have_skills:    skills.slice(0, 3),
    nice_to_have_skills: [],
    seniority:           "mid",
    industry_context:    "",
  }
  if (!apiKey) return fallback

  const text = await callClaude(
    apiKey,
    `You are a technical recruiter. Extract scoring criteria from a job description.
Respond with valid JSON only — no markdown, no explanation.`,
    `Job Title: ${jobTitle}
Skills mentioned: ${skills.join(", ")}
Job Description:
${(jobDescription || "").slice(0, 2000)}

Return JSON:
{
  "must_have_skills": ["skill1", "skill2"],
  "nice_to_have_skills": ["skill3"],
  "seniority": "<junior|mid|senior|lead|principal>",
  "industry_context": "<brief domain context, one phrase>"
}`,
    400
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
    education:  (profile.education  as unknown[] | null)?.[0] ?? null,
    about:      ((profile.summary as string | null) ?? (profile.bio as string | null) ?? (profile.about as string | null) ?? "").slice(0, 300),
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

Score 1-10. Rubric: 7-10 = strong fit → pipeline + talent pool, 4-6 = partial fit → talent pool only, 1-3 = weak fit → talent pool only.`,
    200
  )
  const parsed = parseJson<Partial<ProfileScore>>(text, {})
  return {
    score:  Math.min(10, Math.max(1, Number(parsed.score) || 5)),
    reason: parsed.reason || "No reason provided",
  }
}

// ---------- rate limiter (10 calls per hour per user) ----------

const SOURCING_RATE_LIMIT  = 10
const SOURCING_WINDOW_MS   = 3_600_000  // 1 hour

async function checkSourcingRateLimit(
  adminClient: ReturnType<typeof createClient>,
  userId: string
): Promise<boolean> {
  const now      = Date.now()
  const windowTs = new Date(Math.floor(now / SOURCING_WINDOW_MS) * SOURCING_WINDOW_MS).toISOString()

  await adminClient
    .from("rate_limits")
    .delete()
    .lt("window_start", new Date(now - SOURCING_WINDOW_MS * 2).toISOString())

  const { data, error } = await adminClient.rpc("increment_rate_limit", {
    p_user_id:      userId,
    p_window_start: windowTs,
    p_limit:        SOURCING_RATE_LIMIT,
  })

  if (error) {
    console.error("[source-linkedin-candidates] rate limit rpc error (blocking):", error.message)
    return false
  }
  return data === true
}

// ---------- log helper ----------

async function insertLog(row: {
  job_id:                       string | null
  candidates_found:             number
  candidates_added:             number
  candidates_added_to_pipeline: number
  candidates_added_to_pool:     number
  status:                       "success" | "failed"
  error_message:                string | null
}) {
  await supabase.from("linkedin_sourcing_log").insert(row).catch(() => {})
}

// ---------- main handler ----------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  // ---- Require a valid authenticated session ----
  const authHeader = req.headers.get("Authorization") ?? ""
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  // ---- Per-user rate limit: 10 calls per hour (uses module-level service-role client) ----
  const allowed = await checkSourcingRateLimit(supabase, user.id)
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. You can run up to 10 sourcing runs per hour." }),
      {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "3600" },
      }
    )
  }

  const logRow = {
    job_id:                       null as string | null,
    candidates_found:             0,
    candidates_added:             0,
    candidates_added_to_pipeline: 0,
    candidates_added_to_pool:     0,
    status:                       "failed" as "success" | "failed",
    error_message:                null as string | null,
  }

  try {
    const body = await req.json()
    const {
      job_id,
      job_title,
      job_description = "",
      skills          = [],
      location        = "",
    } = body

    if (!job_id || !job_title) throw new Error("job_id and job_title are required")
    logRow.job_id = job_id

    // ---- API key checks ----
    const apifyToken = Deno.env.get("APIFY_API_TOKEN") ?? ""
    if (!apifyToken) {
      await insertLog({ ...logRow, status: "failed", error_message: "APIFY_API_TOKEN not configured" })
      return new Response(
        JSON.stringify({
          success: false,
          user_message: "LinkedIn sourcing is not configured. Please contact support.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    let anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? ""
    if (!anthropicKey) {
      const { data: s } = await supabase
        .from("platform_settings").select("value").eq("key", "anthropic_api_key").single()
      anthropicKey = s?.value ?? ""
    }

    // ---- Check sourcing enabled ----
    const { data: enabledSetting } = await supabase
      .from("platform_settings").select("value").eq("key", "linkedin_sourcing_enabled").single()
    if (enabledSetting?.value === "false") {
      await insertLog({ ...logRow, status: "failed", error_message: "LinkedIn sourcing is disabled" })
      return new Response(JSON.stringify({ success: false, reason: "disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // ---- Read max profiles cap ----
    const { data: maxSetting } = await supabase
      .from("platform_settings").select("value").eq("key", "linkedin_max_profiles").single()
    const maxProfiles = Math.min(Number(maxSetting?.value ?? "25") || 25, 50)

    // ---- Extract scoring intent via Claude (used for scoring, not for search query) ----
    const intent = await extractSearchIntent(
      anthropicKey,
      job_title,
      job_description,
      skills as string[]
    )

    // ---- Build Apify search query from job data directly ----
    const topSkills = (skills as string[]).slice(0, 3).join(" ")
    const searchQuery = [job_title, topSkills].filter(Boolean).join(" ").trim()

    // ---- Mock mode (APIFY_MOCK=true skips API call) ----
    const isMock = Deno.env.get("APIFY_MOCK") === "true"

    let rawProfiles: Array<Record<string, unknown>>

    if (isMock) {
      console.log("[source-linkedin-candidates] MOCK MODE — returning hardcoded profiles")
      rawProfiles = mockProfiles()
    } else {
      // ---- Call Apify LinkedIn Profile Search actor ----
      const apifyBody: Record<string, unknown> = {
        searchQuery,
        searchMode: "full",
        maxItems:   maxProfiles,
      }
      if (location) apifyBody.location = location

      const apifyRes = await fetch(
        `${APIFY_RUN_URL}?token=${apifyToken}`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(apifyBody),
          signal:  AbortSignal.timeout(270_000), // 4.5 min — stay under Supabase edge function 300s limit
        }
      )

      if (!apifyRes.ok) {
        const errText = await apifyRes.text().catch(() => apifyRes.statusText)
        console.error(`[source-linkedin-candidates] Apify error (${apifyRes.status}): ${errText}`)
        await insertLog({
          ...logRow,
          status: "failed",
          error_message: `Apify ${apifyRes.status}: ${errText.slice(0, 200)}`,
        })
        const linkedinFallback = buildLinkedInUrl(job_title, location)
        return new Response(
          JSON.stringify({
            success:        false,
            user_message:   "LinkedIn sourcing is temporarily unavailable. You can upload CVs manually in the meantime.",
            show_cv_upload: true,
            linkedin_url:   linkedinFallback,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      const apifyJson = await apifyRes.json()
      // run-sync-get-dataset-items returns an array directly
      rawProfiles = Array.isArray(apifyJson) ? apifyJson : []
    }

    logRow.candidates_found = rawProfiles.length

    if (rawProfiles.length === 0) {
      await insertLog({ ...logRow, status: "success" })
      const linkedinFallback = buildLinkedInUrl(job_title, location)
      return new Response(
        JSON.stringify({
          success:          true,
          candidates_added: 0,
          talent_pool_added: 0,
          user_message:     "No matching profiles found. Try broadening the job requirements or adjusting the location.",
          linkedin_url:     linkedinFallback,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // ---- Score, route, and insert each profile ----
    let candidatesAdded = 0  // pipeline inserts (score 7+)
    let talentPoolAdded = 0  // pool inserts (all scores)
    let matchedCount    = 0  // score 4+ (for "profiles_matched" sourcing stat)

    for (const raw of rawProfiles) {
      const profile     = mapApifyProfile(raw)
      const linkedinUrl = ((profile.linkedin_url ?? "") as string).trim()
      if (!linkedinUrl) continue

      // Claude scores this profile against the JD
      const { score, reason } = await scoreProfile(
        anthropicKey, profile, job_title, job_description, intent
      )

      if (score >= 4) matchedCount++

      // Score 7+: insert to both pipeline (job_id) and pool (job_id = null)
      // Score 1-6: insert to pool only
      const isJobPipeline = score >= 7

      // Extract fields from mapped profile
      const fullName       = ((profile.full_name ?? "") as string).trim()
      const headline       = ((profile.headline ?? "") as string)
      const summary        = ((profile.summary ?? profile.bio ?? headline) as string)
      const currentCompany = (profile.current_company ?? null) as string | null
      const skills_        = (profile.skills ?? []) as string[]
      const experience     = (profile.experience ?? profile.positions ?? []) as unknown[]
      const education      = (profile.education ?? []) as unknown[]
      const totalYears     = estimateYears(experience)
      const educationStr   = formatEducation(education)
      const candidateRole  = headline.split(" at ")[0] || headline || job_title
      const enrichedData   = { ...raw, match_score: score, match_reason: reason }

      const baseRow = {
        full_name:      fullName || "Unknown",
        email:          null,
        candidate_role: candidateRole,
        total_years:    totalYears,
        skills:         Array.isArray(skills_) ? (skills_ as string[]).slice(0, 20) : [],
        education:      educationStr || null,
        summary:        currentCompany
          ? `${currentCompany}${summary ? " · " + summary : ""}`
          : summary || null,
        linkedin_url:   linkedinUrl,
        linkedin_data:  enrichedData,
        source:         "linkedin",
      }

      // --- Talent pool insert (all profiles, job_id = null) ---
      const { count: poolDupCount } = await supabase
        .from("candidates")
        .select("id", { count: "exact", head: true })
        .eq("linkedin_url", linkedinUrl)
        .is("job_id", null)
        .eq("source", "linkedin")

      if ((poolDupCount ?? 0) === 0) {
        await supabase.from("candidates").insert({ ...baseRow, job_id: null })
        talentPoolAdded++
      }

      // --- Pipeline insert (score 7+ only, job_id linked) ---
      if (isJobPipeline) {
        const { count: pipeDupCount } = await supabase
          .from("candidates")
          .select("id", { count: "exact", head: true })
          .eq("linkedin_url", linkedinUrl)
          .eq("job_id", job_id)

        if ((pipeDupCount ?? 0) === 0) {
          await supabase.from("candidates").insert({ ...baseRow, job_id })
          candidatesAdded++
        }
      }
    }

    logRow.candidates_added             = matchedCount
    logRow.candidates_added_to_pipeline = candidatesAdded
    logRow.candidates_added_to_pool     = talentPoolAdded
    logRow.status = "success"
    await insertLog(logRow)

    return new Response(
      JSON.stringify({ success: true, candidates_added: candidatesAdded, talent_pool_added: talentPoolAdded }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (err) {
    const msg = (err as Error).message
    logRow.status = "failed"
    logRow.error_message = msg
    await insertLog(logRow).catch(() => {})
    console.error("[source-linkedin-candidates]", msg)

    // Surface a useful message rather than a generic 500
    const isTimeout = msg.includes("timed out") || msg.includes("AbortError")
    const linkedinFallback = buildLinkedInUrl("", "")

    return new Response(
      JSON.stringify({
        success:        false,
        user_message:   isTimeout
          ? "LinkedIn sourcing timed out. You can upload CVs manually in the meantime."
          : "LinkedIn sourcing is temporarily unavailable. You can upload CVs manually in the meantime.",
        show_cv_upload: true,
        linkedin_url:   linkedinFallback,
        error:          msg,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})

// ---------- helpers ----------

function buildLinkedInUrl(jobTitle: string, location: string): string {
  const params = new URLSearchParams()
  if (jobTitle) params.set("keywords", jobTitle)
  if (location) params.set("location", location)
  return `https://www.linkedin.com/search/results/people/?${params.toString()}`
}
