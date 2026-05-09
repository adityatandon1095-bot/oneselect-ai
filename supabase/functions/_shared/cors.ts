// Shared CORS headers for all edge functions.
// Set ALLOWED_ORIGIN in Supabase Edge Function secrets to restrict to your
// production domain (e.g. https://yourapp.vercel.app).
// Defaults to '*' so local dev works without configuration.
const origin = Deno.env.get("ALLOWED_ORIGIN") ?? "*"

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin":  origin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}
