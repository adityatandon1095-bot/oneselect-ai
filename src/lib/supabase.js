import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      // Bypass navigator.locks — prevents the lock-stealing error in dev
      // and any single-tab environment. Safe for browser-only apps.
      lock: async (_name, _acquireTimeout, fn) => fn(),
    },
  }
)
