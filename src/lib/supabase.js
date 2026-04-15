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

// Isolated client used only for creating new user accounts from the admin UI.
// Uses a separate storageKey so signUp/signOut on this client never touches
// the admin's session stored under the default key.
export const supabaseSignup = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      storageKey:       'oneselect-signup-client',
      autoRefreshToken: false,
      persistSession:   false,
    },
  }
)
