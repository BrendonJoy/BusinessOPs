import type { createClient } from '@/lib/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export async function getCompanyCurrency(
  supabase: SupabaseClient
): Promise<{ currency: string; tax_label: string; default_tax_rate: number }> {
  const { data } = await supabase
    .from('profiles')
    .select('company:companies(currency, tax_label, default_tax_rate)')
    .single()

  const company = data?.company as unknown as
    | { currency: string; tax_label: string; default_tax_rate: number }
    | null

  return company ?? { currency: 'USD', tax_label: 'Tax', default_tax_rate: 0 }
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

export async function getGeofenceSettings(
  supabase: SupabaseClient
): Promise<{ geofence_enabled: boolean; geofence_radius_meters: number }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const defaults = { geofence_enabled: false, geofence_radius_meters: 200 }

  if (!user) return defaults

  const { data } = await supabase
    .from('profiles')
    .select('company:companies(geofence_enabled, geofence_radius_meters)')
    .eq('id', user.id)
    .maybeSingle()

  const company = data?.company as unknown as {
    geofence_enabled: boolean
    geofence_radius_meters: number
  } | null

  return company ?? defaults
}

export async function getCompanyInfo(
  supabase: SupabaseClient
): Promise<{ name: string; currency: string; gst_registered: boolean } | null> {
  const { data } = await supabase
    .from('profiles')
    .select('company:companies(name, currency, gst_registered)')
    .single()

  return (
    (data?.company as unknown as { name: string; currency: string; gst_registered: boolean } | null) ?? null
  )
}
