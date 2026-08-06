import type { createClient } from '@/lib/supabase/server'
import type { PayCycleLength } from '@trade-assist/db'
import { DEFAULT_TIMEZONE, isValidTimezone } from '@/lib/timezone'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

/**
 * The zone this business works in. Every screen that shows a time and every
 * action that reads one needs it, so it is fetched rather than inferred from
 * the runtime — the server is UTC and the reader could be anywhere.
 *
 * The fallback is only reached for a signed-out caller or a row written before
 * the column existed; the database defaults and validates it otherwise. It is
 * checked for validity all the same, because an unknown name makes
 * Intl.DateTimeFormat throw, and a RangeError here would take out the roster
 * and the calendar for the whole company at once.
 */
export async function getCompanyTimezone(supabase: SupabaseClient): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return DEFAULT_TIMEZONE

  const { data } = await supabase
    .from('profiles')
    .select('company:companies(timezone)')
    .eq('id', user.id)
    .maybeSingle()

  const zone = (data?.company as unknown as { timezone: string } | null)?.timezone
  return zone && isValidTimezone(zone) ? zone : DEFAULT_TIMEZONE
}

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

/**
 * The zone a shift's times are in: its own venue's, else its event's venue's,
 * else the company's.
 *
 * There is one rule and it lives here. A shift showing 4pm on the event page and
 * 2pm on the roster would be worse than having no venue override at all, so
 * every screen and the create action all resolve through this.
 *
 * Most companies never set a venue zone, in which case every branch below lands
 * on the company's and the extra lookups are skipped.
 */
export async function resolveShiftTimezone(
  supabase: SupabaseClient,
  shift: { venueId?: string | null; eventDayId?: string | null }
): Promise<string> {
  const companyZone = await getCompanyTimezone(supabase)

  let venueId = shift.venueId ?? null

  // An event shift normally has no venue of its own and inherits the event's,
  // so that moving the event moves its shifts with it — zone included.
  if (!venueId && shift.eventDayId) {
    const { data: day } = await supabase
      .from('event_days')
      .select('event_id')
      .eq('id', shift.eventDayId)
      .maybeSingle()

    if (day?.event_id) {
      const { data: event } = await supabase
        .from('events')
        .select('venue_id')
        .eq('id', day.event_id)
        .maybeSingle()
      venueId = event?.venue_id ?? null
    }
  }

  if (!venueId) return companyZone

  const { data: venue } = await supabase
    .from('venues')
    .select('timezone')
    .eq('id', venueId)
    .maybeSingle()

  const zone = venue?.timezone as string | null | undefined
  return zone && isValidTimezone(zone) ? zone : companyZone
}

export async function getCompanyModules(supabase: SupabaseClient): Promise<{
  modules_quotes_enabled: boolean
  modules_invoicing_enabled: boolean
  modules_expenses_enabled: boolean
  modules_reports_enabled: boolean
  modules_timesheets_enabled: boolean
  modules_events_enabled: boolean
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
    // Off unless a company has turned it on. The other defaults describe
    // behaviour customers already had; this one would add a product's worth of
    // screens to an account that never asked for it.
    modules_events_enabled: false,
  }

  if (!user) return defaults

  const { data } = await supabase
    .from('profiles')
    .select(
      'company:companies(modules_quotes_enabled, modules_invoicing_enabled, modules_expenses_enabled, modules_reports_enabled, modules_timesheets_enabled, modules_events_enabled)'
    )
    .eq('id', user.id)
    .maybeSingle()

  const company = data?.company as unknown as {
    modules_quotes_enabled: boolean
    modules_invoicing_enabled: boolean
    modules_expenses_enabled: boolean
    modules_reports_enabled: boolean
    modules_timesheets_enabled: boolean
    modules_events_enabled: boolean
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
