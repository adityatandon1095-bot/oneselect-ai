import { createClient } from '@supabase/supabase-js'

// ⚠️  Uses the service-role key — bypasses all RLS.
// Only import this file from admin portal pages (src/pages/admin/*).
// Never use it in recruiter pages.
export const supabaseAdmin = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession:   false,
      storageKey:       'supabase-admin',  // prevent multiple GoTrueClient warning
    },
  }
)
