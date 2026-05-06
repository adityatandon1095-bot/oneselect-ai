import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const expectedKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const suppliedKey = req.headers.get('apikey') || req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!suppliedKey || suppliedKey !== expectedKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { email, password, company_name, contact_name } = await req.json()

    if (!email || !password || !company_name) {
      return new Response(JSON.stringify({ error: 'email, password and company_name are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (password.length < 8) {
      return new Response(JSON.stringify({ error: 'Password must be at least 8 characters' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl  = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const admin        = createClient(supabaseUrl, serviceKey)

    // Check if email already registered
    const { data: existing } = await admin.from('profiles').select('id').eq('email', email.toLowerCase().trim()).maybeSingle()
    if (existing) {
      return new Response(JSON.stringify({ error: 'An account with this email already exists. Please sign in.' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create auth user with confirmed email — no confirmation step needed
    const { data: userData, error: createError } = await admin.auth.admin.createUser({
      email:          email.toLowerCase().trim(),
      password,
      email_confirm:  true,
      user_metadata:  { role: 'client', company_name: company_name.trim(), contact_name: contact_name?.trim() ?? '' },
    })

    if (createError || !userData.user) {
      return new Response(JSON.stringify({ error: createError?.message ?? 'Failed to create account' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create profile row
    await admin.from('profiles').insert({
      id:                  userData.user.id,
      email:               email.toLowerCase().trim(),
      user_role:           'client',
      company_name:        company_name.trim(),
      full_name:           contact_name?.trim() ?? null,
      subscription_status: 'trial',
      first_login:         true,
    })

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
