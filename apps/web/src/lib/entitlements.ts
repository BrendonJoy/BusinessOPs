import type { createClient } from '@/lib/supabase/server'
import type { CompanyProduct, ProductKey } from '@trade-assist/db'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

/**
 * What the company has bought, as distinct from what they have switched on.
 *
 * These are two different facts and the UI has to keep them apart. A module
 * toggle is the company's own choice about what their staff see; an entitlement
 * is what they pay for. Both must be true for a surface to appear, and when one
 * is missing the app should say which — otherwise someone buys an upgrade to
 * fix something a checkbox would have fixed.
 */
export async function getCompanyProducts(supabase: SupabaseClient): Promise<CompanyProduct[]> {
  // RLS scopes this to the caller's own company.
  const { data } = await supabase
    .from('company_products')
    .select('product, plan, status, trial_ends_at')

  return (data ?? []) as CompanyProduct[]
}

/**
 * A trial is as entitled as a paid subscription — that is the point of a trial.
 * 'past_due' also still counts: dunning is a conversation, and locking someone
 * out of their own roster the morning a card expires is a way to lose them
 * rather than to get paid.
 */
export function isEntitled(products: CompanyProduct[], product: ProductKey): boolean {
  const held = products.find((p) => p.product === product)
  return held !== undefined && held.status !== 'cancelled'
}

export function planFor(products: CompanyProduct[], product: ProductKey): string | null {
  return products.find((p) => p.product === product)?.plan ?? null
}

/**
 * Whether this account can have other people in it.
 *
 * The BusinessOps tier line is simply "more than one person": Individual is a
 * sole trader with their own jobs, invoices and timesheets, and Company adds
 * everyone else — inviting staff, pay rates, approving other people's time,
 * payroll across a team, the staff report.
 *
 * Deliberately permissive when the row is missing or unrecognised. Getting this
 * wrong in the generous direction shows someone a feature they might not have
 * paid for; getting it wrong the other way locks a paying customer out of their
 * own staff, which is far worse and lands on a support inbox.
 */
export function hasStaffFeatures(products: CompanyProduct[]): boolean {
  if (!isEntitled(products, 'businessops')) return false
  return planFor(products, 'businessops') !== 'individual'
}

/**
 * Shortcut for server components, which almost always want the one answer
 * rather than the whole list.
 */
export async function companyHasStaffFeatures(supabase: SupabaseClient): Promise<boolean> {
  return hasStaffFeatures(await getCompanyProducts(supabase))
}
