import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

const IP_RATE_LIMIT = 5         // max applications
const IP_WINDOW_MS  = 3_600_000 // per 1 hour

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return req.headers.get("cf-connecting-ip") ?? "unknown"
}

async function checkIpRateLimit(
  admin: ReturnType<typeof createClient>,
  ip: string
): Promise<boolean> {
  const now      = Date.now()
  const windowTs = new Date(Math.floor(now / IP_WINDOW_MS) * IP_WINDOW_MS).toISOString()

  // Prune rows older than 2 windows
  await admin
    .from("ip_rate_limits")
    .delete()
    .lt("window_start", new Date(now - IP_WINDOW_MS * 2).toISOString())

  const { data, error } = await admin.rpc("increment_ip_rate_limit", {
    p_ip_key:       ip,
    p_window_start: windowTs,
    p_limit:        IP_RATE_LIMIT,
  })

  if (error) {
    console.error("[public-apply] ip rate limit rpc error (blocking):", error.message)
    return false
  }
  return data === true
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const supabaseUrl    = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceKey     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  const admin          = createClient(supabaseUrl, serviceKey)

  const ip = getClientIp(req)
  const allowed = await checkIpRateLimit(admin, ip)

  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "Too many applications from this IP. Please try again later." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }

  try {
    const body = await req.json()
    const { job_id, full_name, email, phone, raw_text, linkedin_url, github_url, job_title } = body

    if (!job_id || !full_name || !email) {
      return new Response(
        JSON.stringify({ error: "job_id, full_name and email are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const { error: insertError } = await admin.from("candidates").insert({
      job_id,
      full_name:    String(full_name).trim(),
      email:        String(email).trim().toLowerCase(),
      phone:        phone ? String(phone).trim() : "",
      raw_text:     raw_text ?? null,
      linkedin_url: linkedin_url ? String(linkedin_url).trim() : null,
      github_url:   github_url  ? String(github_url).trim()  : null,
      source:       "applied",
    })

    if (insertError) {
      if (insertError.code === "23505" || insertError.message?.includes("candidates_public_apply_unique")) {
        return new Response(
          JSON.stringify({ error: "duplicate", message: "You have already applied for this position." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }
      throw new Error(insertError.message)
    }

    // Fire-and-forget confirmation email — failure doesn't block the response
    if (email && full_name && job_title) {
      fetch(`${supabaseUrl}/functions/v1/notify-candidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
        body: JSON.stringify({
          type: "application_received",
          candidateEmail: String(email).trim(),
          candidateName:  String(full_name).trim(),
          jobTitle:       job_title,
        }),
      }).catch((e) => console.warn("[public-apply] notify-candidate failed:", e))
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("[public-apply]", (err as Error).message)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
