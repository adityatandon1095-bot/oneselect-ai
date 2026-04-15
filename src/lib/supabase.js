import { createClient } from '@supabase/supabase-js'

const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
console.log('Supabase key format:', anonKey?.slice(0, 10))

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  anonKey,
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
  anonKey,
  {
    auth: {
      storageKey:       'oneselect-signup-client',
      autoRefreshToken: false,
      persistSession:   false,
    },
  }
)
