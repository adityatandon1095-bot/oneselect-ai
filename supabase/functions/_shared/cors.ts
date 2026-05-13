// Shared CORS headers for all Supabase edge functions.
//
// PRODUCTION REQUIREMENT: Set ALLOWED_ORIGIN in Supabase Edge Function secrets
// to your exact production domain (e.g. https://app.oneselect.co.uk).
// Without it the header defaults to '*', which allows any origin (fine in dev,
// not acceptable in production).
//
// Supabase Dashboard → Settings → Edge Functions → Secrets → ALLOWED_ORIGIN
const origin = Deno.env.get("ALLOWED_ORIGIN") ?? "*"

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin":  origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}
