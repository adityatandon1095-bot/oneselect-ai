import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const anonKey      = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, anonKey, {
  auth: {
    // In dev, bypass navigator.locks to avoid lock-stealing errors from Vite HMR
    // (multiple module instances fight over the same lock name).
    // In production this is not needed — proper locking coordinates token
    // refreshes correctly across multiple tabs.
    ...(import.meta.env.DEV && {
      lock: async (_name, _acquireTimeout, fn) => fn(),
    }),
  },
})

// Isolated client used only for creating new user accounts from the admin UI.
// Separate storageKey means signUp / signOut on this client never touches the
// admin's own session stored under the default key.
export const supabaseSignup = createClient(supabaseUrl, anonKey, {
  auth: {
    storageKey:       'oneselect-signup-client',
    autoRefreshToken: false,
    persistSession:   false,
  },
})
