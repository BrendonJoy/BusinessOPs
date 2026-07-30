import { createClient } from '@supabase/supabase-js'

// Service-role client for trusted server-side jobs with no user session
// (the daily feedback-digest cron). Bypasses RLS entirely -- never import
// this from anything reachable by user-triggered request handling.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) return null

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
