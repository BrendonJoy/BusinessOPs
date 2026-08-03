import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Data retention policy.
 *
 * This file is the single source of truth for how long BusinessOps keeps
 * personal data. The privacy policy must be written from these numbers — a
 * stated retention period that the code does not actually enforce is worse than
 * having no stated period at all.
 *
 * ## What is NOT purged, and why
 *
 * Deliberately absent from this list:
 *
 * - **Quotes, invoices, expenses and cost entries.** Tax law requires business
 *   records to be kept for seven years in New Zealand, Australia and the UK.
 *   Purging them would put our customers in breach of their own obligations.
 * - **Timesheets, timesheet days and payroll periods.** Wage and time records
 *   carry statutory minimums of their own — six years in NZ, seven in Australia.
 *   These are employment records, not telemetry, however monitoring-like they
 *   feel.
 * - **Jobs, customers, staff profiles.** Live business data. It goes when the
 *   account goes, which is what account deletion is for.
 *
 * The two categories below are the ones with no statutory floor: they exist for
 * our convenience, so they get an expiry.
 */

/** Assistant transcripts. Long enough to carry context across a season. */
export const CHAT_MESSAGE_RETENTION_MONTHS = 12

/**
 * Who changed what on a job. Employee monitoring data, so it gets a bound — but
 * a longer one, because a disputed job or a pay disagreement can surface a year
 * or more after the work.
 */
export const JOB_AUDIT_LOG_RETENTION_MONTHS = 24

export type PurgeResult = {
  chatMessages: number
  jobAuditLog: number
  cutoffs: { chatMessages: string; jobAuditLog: string }
}

/**
 * `now` is a parameter rather than being read inside, so the purge can be tested
 * against a fixed date instead of whatever today happens to be.
 */
export function retentionCutoff(months: number, now: Date = new Date()): Date {
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - months)
  return cutoff
}

/**
 * Deletes everything past its retention period. Requires a service-role client:
 * RLS scopes deletes to a single company, and this runs for all of them.
 */
export async function purgeExpiredData(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<PurgeResult> {
  const chatCutoff = retentionCutoff(CHAT_MESSAGE_RETENTION_MONTHS, now)
  const auditCutoff = retentionCutoff(JOB_AUDIT_LOG_RETENTION_MONTHS, now)

  // `count: 'exact'` makes the deleted row count the evidence that the policy
  // ran — a purge job that silently deletes nothing looks identical to one that
  // is working correctly, which is how these rot unnoticed.
  const { count: chatCount, error: chatError } = await supabase
    .from('chat_messages')
    .delete({ count: 'exact' })
    .lt('created_at', chatCutoff.toISOString())

  if (chatError) throw new Error(`chat_messages purge failed: ${chatError.message}`)

  const { count: auditCount, error: auditError } = await supabase
    .from('job_audit_log')
    .delete({ count: 'exact' })
    .lt('created_at', auditCutoff.toISOString())

  if (auditError) throw new Error(`job_audit_log purge failed: ${auditError.message}`)

  return {
    chatMessages: chatCount ?? 0,
    jobAuditLog: auditCount ?? 0,
    cutoffs: {
      chatMessages: chatCutoff.toISOString(),
      jobAuditLog: auditCutoff.toISOString(),
    },
  }
}
