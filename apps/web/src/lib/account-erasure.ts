import type { SupabaseClient } from '@supabase/supabase-js'
import { DELETION_GRACE_DAYS } from '@/lib/account-deletion'

export type ErasureResult = {
  companyId: string
  companyName: string | null
  requestedAt: string
  filesRemoved: number
  authUsersDeleted: number
}

/**
 * Storage paths are keyed differently per bucket, which is easy to get wrong
 * and leaves orphaned customer photos behind if you do:
 *
 *   company-logos     {companyId}/logo-…
 *   expense-receipts  {companyId}/{uuid}-{filename}
 *   job-files         {jobId}/{uuid}-{filename}   ← job, not company
 *
 * `list()` is not recursive and does not error on a missing prefix, so it must
 * be called once per prefix and an empty result means nothing rather than
 * failure.
 */
async function removeStorageForCompany(
  supabase: SupabaseClient,
  companyId: string,
  jobIds: string[]
): Promise<number> {
  const targets: Array<{ bucket: string; prefix: string }> = [
    { bucket: 'company-logos', prefix: companyId },
    { bucket: 'expense-receipts', prefix: companyId },
    ...jobIds.map((jobId) => ({ bucket: 'job-files', prefix: jobId })),
  ]

  let removed = 0

  for (const { bucket, prefix } of targets) {
    const { data: entries } = await supabase.storage.from(bucket).list(prefix)
    const paths = (entries ?? []).map((entry) => `${prefix}/${entry.name}`)
    if (paths.length === 0) continue

    const { error } = await supabase.storage.from(bucket).remove(paths)
    if (!error) removed += paths.length
  }

  return removed
}

/**
 * Permanently erases every company whose grace period has expired.
 *
 * Requires a service-role client: this deletes across all companies and removes
 * auth users, neither of which any user session can do.
 */
export async function eraseExpiredAccounts(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<ErasureResult[]> {
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - DELETION_GRACE_DAYS)

  const { data: companies, error } = await supabase
    .from('companies')
    .select('id, name, deletion_requested_at')
    .not('deletion_requested_at', 'is', null)
    .lt('deletion_requested_at', cutoff.toISOString())

  if (error) throw new Error(`could not list expired accounts: ${error.message}`)

  const results: ErasureResult[] = []

  for (const company of companies ?? []) {
    const companyId = company.id as string

    // Both lists must be captured BEFORE the company row goes: deleting it
    // cascades jobs and profiles away, and with them any way to find the files
    // in storage or the auth users that outlive the profile rows.
    const { data: jobs } = await supabase.from('jobs').select('id').eq('company_id', companyId)
    const { data: profiles } = await supabase.from('profiles').select('id').eq('company_id', companyId)

    const jobIds = (jobs ?? []).map((job) => job.id as string)
    const profileIds = (profiles ?? []).map((profile) => profile.id as string)

    const filesRemoved = await removeStorageForCompany(supabase, companyId, jobIds)

    const { error: deleteError } = await supabase.from('companies').delete().eq('id', companyId)
    if (deleteError) {
      throw new Error(`could not delete company ${companyId}: ${deleteError.message}`)
    }

    // Auth users are not reachable by a foreign key from companies, so they
    // survive the cascade and have to go explicitly. Without this the addresses
    // stay registered and the person can neither sign up again nor log in.
    let authUsersDeleted = 0
    for (const profileId of profileIds) {
      const { error: authError } = await supabase.auth.admin.deleteUser(profileId)
      if (!authError) authUsersDeleted += 1
    }

    results.push({
      companyId,
      companyName: (company.name as string | null) ?? null,
      requestedAt: company.deletion_requested_at as string,
      filesRemoved,
      authUsersDeleted,
    })
  }

  return results
}
