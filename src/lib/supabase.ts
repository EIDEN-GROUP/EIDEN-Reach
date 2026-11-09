import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// We keep the default in-memory session via `persistSession`, but disable
// the library's implicit auto-refresh. App.tsx refreshes the session
// explicitly on a safe schedule; that avoids parallel implicit refreshes
// hitting the free-tier rate limit on `grant_type=refresh_token`.
export const supabase = url && anonKey ? createClient(url, anonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'eiden.reach.supabase.auth.token',
  },
}) : null
export const databaseConfigured = Boolean(supabase)

export async function refreshSession(): Promise<boolean> {
  if (!supabase) return false
  const { data, error } = await supabase.auth.refreshSession()
  return !error && Boolean(data?.session)
}
