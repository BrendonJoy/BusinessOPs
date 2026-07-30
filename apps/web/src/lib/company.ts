import type { createClient } from '@/lib/supabase/server'
import type { PayCycleLength } from '@trade-assist/db'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export async function getCompanyCurrency(
  supabase: SupabaseClient
): Promise<{ currency: string; tax_label: string; default_tax_rate: number }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const defaults = { currency: 'USD', tax_label: 'Tax', default_tax_rate: 0 }
  if (!user) return defaults

  const { data } = await supabase
    .from('profiles')
    .select('company:companies(currency, tax_label, default_tax_rate)')
    .eq('id', user.id)
    .maybeSingle()

  const company = data?.company as unknown as
    | { currency: string; tax_label: string; default_tax_rate: number }
    | null

  return company ?? defaults
}

export async function getCompanyModules(supabase: SupabaseClient): Promise<{
  modules_quotes_enabled: boolean
  modules_invoicing_enabled: boolean
  modules_expenses_enabled: boolean
  modules_reports_enabled: boolean
  modules_timesheets_enabled: boolean
}> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const defaults = {
    modules_quotes_enabled: true,
    modules_invoicing_enabled: true,
    modules_expenses_enabled: true,
    modules_reports_enabled: true,
    modules_timesheets_enabled: true,
  }

  if (!user) return defaults

  const { data } = await supabase
    .from('profiles')
    .select(
      'company:companies(modules_quotes_enabled, modules_invoicing_enabled, modules_expenses_enabled, modules_reports_enabled, modules_timesheets_enabled)'
    )
    .eq('id', user.id)
    .maybeSingle()

  const company = data?.company as unknown as {
    modules_quotes_enabled: boolean
    modules_invoicing_enabled: boolean
    modules_expenses_enabled: boolean
    modules_reports_enabled: boolean
    modules_timesheets_enabled: boolean
  } | null

  return company ?? defaults
}

export type TimesheetSettings = {
  geofence_enabled: boolean
  geofence_radius_meters: number
  workday_enforced: boolean
  workday_start: string
  workday_end: string
  workday_days: number[]
  pay_cycle_length: PayCycleLength
  pay_cycle_anchor: string | null
}

export async function getTimesheetSettings(supabase: SupabaseClient): Promise<TimesheetSettings> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const defaults: TimesheetSettings = {
    geofence_enabled: false,
    geofence_radius_meters: 200,
    workday_enforced: false,
    workday_start: '07:00',
    workday_end: '17:00',
    workday_days: [1, 2, 3, 4, 5],
    pay_cycle_length: 'weekly',
    pay_cycle_anchor: null,
  }

  if (!user) return defaults

  const { data } = await supabase
    .from('profiles')
    .select(
      'company:companies(geofence_enabled, geofence_radius_meters, workday_enforced, workday_start, workday_end, workday_days, pay_cycle_length, pay_cycle_anchor)'
    )
    .eq('id', user.id)
    .maybeSingle()

  const company = data?.company as unknown as TimesheetSettings | null

  return company ?? defaults
}

// The company account's login email -- used as the reply-to on outbound
// customer emails so replies reach the business owner, not our send domain.
export async function getCompanyContactEmail(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // RLS already scopes profiles to the caller's company.
  const { data } = await supabase
    .from('profiles')
    .select('email')
    .eq('role', 'company')
    .limit(1)
    .maybeSingle()

  return data?.email ?? null
}

export async function getCompanyInfo(
  supabase: SupabaseClient
): Promise<{ name: string; currency: string; gst_registered: boolean } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('company:companies(name, currency, gst_registered)')
    .eq('id', user.id)
    .maybeSingle()

  return (
    (data?.company as unknown as { name: string; currency: string; gst_registered: boolean } | null) ?? null
  )
}
