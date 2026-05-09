import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from "../_shared/cors.ts"

// Intended to be called by a Supabase cron job or manually from admin.
// Nulls out raw_text for candidates/talent_pool entries older than 12 months
// to comply with DPDPA data minimisation requirements.

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Only allow calls with service role key or from the Supabase cron runner
  const expectedKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const suppliedKey = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!suppliedKey || suppliedKey !== expectedKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const admin       = createClient(supabaseUrl, expectedKey)

    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - 12)
    const cutoffIso = cutoff.toISOString()

    // Null raw_text on candidates older than 12 months
    const { count: candidatesUpdated } = await admin
      .from('candidates')
      .update({ raw_text: null })
      .lt('created_at', cutoffIso)
      .not('raw_text', 'is', null)

    // Null raw_text on talent_pool entries older than 12 months
    const { count: poolUpdated } = await admin
      .from('talent_pool')
      .update({ raw_text: null })
      .lt('created_at', cutoffIso)
      .not('raw_text', 'is', null)

    return new Response(JSON.stringify({
      success: true,
      candidatesUpdated: candidatesUpdated ?? 0,
      poolUpdated:       poolUpdated ?? 0,
      cutoff:            cutoffIso,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('cleanup-stale-data error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
