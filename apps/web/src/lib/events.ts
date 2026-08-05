import { notFound } from 'next/navigation'
import type { createClient } from '@/lib/supabase/server'
import { getCompanyModules } from '@/lib/company'
import { getCompanyProducts, isEntitled } from '@/lib/entitlements'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

/**
 * Whether StaffOps surfaces should appear: bought AND switched on.
 *
 * Two separate facts, deliberately ANDed. Entitlement is what the company pays
 * for; the module toggle is their own choice about what their staff see. Either
 * one missing hides the screens, and Settings is where the difference between
 * them is explained.
 */
export async function eventsAvailable(supabase: SupabaseClient): Promise<boolean> {
  const [modules, products] = await Promise.all([
    getCompanyModules(supabase),
    getCompanyProducts(supabase),
  ])

  return modules.modules_events_enabled && isEntitled(products, 'staffops')
}

/**
 * Every StaffOps screen is behind the above.
 *
 * notFound() rather than a redirect: to a company that has not bought it or has
 * switched it off, these routes genuinely do not exist, and bouncing them to
 * the dashboard with no explanation reads like a bug. RLS still scopes the data
 * underneath — this only hides screens, it is not the security boundary.
 */
export async function requireEventsModule(supabase: SupabaseClient): Promise<void> {
  if (!(await eventsAvailable(supabase))) notFound()
}
