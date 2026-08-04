import { notFound } from 'next/navigation'
import type { createClient } from '@/lib/supabase/server'
import { getCompanyModules } from '@/lib/company'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

/**
 * Every StaffOps screen is behind the events module.
 *
 * notFound() rather than a redirect: to a company that has not switched it on,
 * these routes genuinely do not exist, and bouncing them to the dashboard with
 * no explanation reads like a bug. RLS still scopes the data underneath — this
 * only hides screens, it is not the security boundary.
 */
export async function requireEventsModule(supabase: SupabaseClient): Promise<void> {
  const modules = await getCompanyModules(supabase)
  if (!modules.modules_events_enabled) notFound()
}
