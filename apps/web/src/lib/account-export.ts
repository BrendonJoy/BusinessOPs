import type { createClient } from '@/lib/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

/**
 * Everything a company can take with them.
 *
 * Each table is read through the *caller's own session*, so row-level security
 * does the scoping. That is deliberate: hand-writing `eq('company_id', …)` for
 * nineteen tables — several of which are scoped indirectly through jobs — is
 * exactly the sort of thing that quietly exports one row too many. Here, a
 * mistake can only ever return less than intended, never another company's
 * data.
 */
const EXPORTED_TABLES = [
  'companies',
  'profiles',
  'company_invites',
  'staff_pay_rates',
  'customers',
  'jobs',
  'job_assignments',
  'job_files',
  'job_audit_log',
  'quotes',
  'quote_line_items',
  'invoices',
  'invoice_line_items',
  'cost_entries',
  'expenses',
  'timesheet_entries',
  'timesheet_days',
  'payroll_periods',
  'chat_messages',
  'feedback_messages',
] as const

export type AccountExport = {
  exported_at: string
  format_notes: string[]
  tables: Record<string, unknown[]>
}

export async function buildAccountExport(supabase: SupabaseClient): Promise<AccountExport> {
  const tables: Record<string, unknown[]> = {}

  for (const table of EXPORTED_TABLES) {
    const { data, error } = await supabase.from(table).select('*')
    // One unreadable table should not cost the customer the other nineteen.
    // The gap is recorded in the file rather than passed over in silence.
    tables[table] = error ? [] : (data ?? [])
    if (error) {
      tables[`${table}__error`] = [{ message: error.message }]
    }
  }

  return {
    exported_at: new Date().toISOString(),
    format_notes: [
      'One key per database table. Rows are exactly as stored.',
      'Uploaded files (job photos, receipts, company logo) are not embedded. job_files.file_url and the expense receipt paths identify them; download them from the app before deleting the account.',
      'chat_messages contains only the requesting user\'s own assistant transcripts. Each staff member\'s transcript is their own personal data and is readable only by them.',
      'Money columns are stored as decimals, dates as ISO 8601.',
    ],
    tables,
  }
}
