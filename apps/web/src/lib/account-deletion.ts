import type { createClient } from '@/lib/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

/**
 * Deletion is requested, not performed.
 *
 * The account closes the moment it is requested — nobody in the company can use
 * the app — but the data is not erased until the grace period expires. A trades
 * business's entire job, quote and invoice history should not be destroyable by
 * one misclick on a bad day, and erasure is the one mistake no amount of
 * apologising undoes.
 *
 * 30 days is still inside the one month UK GDPR allows for responding to an
 * erasure request, so the grace period costs nothing in compliance terms.
 */
export const DELETION_GRACE_DAYS = 30

export type DeletionState = {
  requestedAt: Date
  erasesAt: Date
  daysRemaining: number
}

export function deletionState(requestedAt: string | null, now: Date = new Date()): DeletionState | null {
  if (!requestedAt) return null

  const requested = new Date(requestedAt)
  const erases = new Date(requested)
  erases.setDate(erases.getDate() + DELETION_GRACE_DAYS)

  // Rounded up, so "1 day remaining" never displays while there are still
  // hours left to change your mind.
  const daysRemaining = Math.max(0, Math.ceil((erases.getTime() - now.getTime()) / 86_400_000))

  return { requestedAt: requested, erasesAt: erases, daysRemaining }
}

/**
 * Read straight from `companies` rather than trusting a cached value: this
 * gates access to the whole application, so it should reflect the database on
 * every request.
 */
export async function getDeletionState(supabase: SupabaseClient): Promise<DeletionState | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.company_id) return null

  const { data: company } = await supabase
    .from('companies')
    .select('deletion_requested_at')
    .eq('id', profile.company_id)
    .maybeSingle()

  return deletionState((company?.deletion_requested_at as string | null) ?? null)
}
