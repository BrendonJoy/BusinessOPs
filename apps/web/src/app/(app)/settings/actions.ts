'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { PAY_CYCLE_LENGTHS, type PayCycleLength } from '@trade-assist/db'

function errorRedirect(message: string): never {
  redirect(`/settings?error=${encodeURIComponent(message)}`)
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

async function getCompanyId(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase.from('profiles').select('company_id').eq('id', user.id).maybeSingle()
  return data?.company_id ?? null
}

export async function updateCompany(formData: FormData) {
  const supabase = await createClient()
  const companyId = await getCompanyId(supabase)
  if (!companyId) errorRedirect('Could not determine your company.')

  const name = String(formData.get('name') ?? '').trim()
  const gstNumber = String(formData.get('gst_number') ?? '').trim() || null
  const address = String(formData.get('address') ?? '').trim() || null
  const currency = String(formData.get('currency') ?? 'USD')
  const taxLabel = String(formData.get('tax_label') ?? '').trim() || 'Tax'
  const defaultTaxRate = Number(formData.get('default_tax_rate') ?? 0)
  const gstRegistered = formData.get('gst_registered') === 'on'
  const paymentDetails = String(formData.get('payment_details') ?? '').trim() || null
  const jobPrefix = String(formData.get('job_prefix') ?? '').trim()

  if (!name) errorRedirect('Company name is required.')
  if (!jobPrefix || jobPrefix.length > 10) {
    errorRedirect('Job number prefix must be 1–10 characters.')
  }

  const { error } = await supabase
    .from('companies')
    .update({
      name,
      gst_number: gstNumber,
      address,
      currency,
      tax_label: taxLabel,
      default_tax_rate: defaultTaxRate,
      gst_registered: gstRegistered,
      payment_details: paymentDetails,
      job_prefix: jobPrefix,
    })
    .eq('id', companyId)

  if (error) errorRedirect(error.message)

  revalidatePath('/settings')
}

export async function updateCompanyModules(formData: FormData) {
  const supabase = await createClient()
  const companyId = await getCompanyId(supabase)
  if (!companyId) errorRedirect('Could not determine your company.')

  const { error } = await supabase
    .from('companies')
    .update({
      modules_quotes_enabled: formData.get('modules_quotes_enabled') === 'on',
      modules_invoicing_enabled: formData.get('modules_invoicing_enabled') === 'on',
      modules_expenses_enabled: formData.get('modules_expenses_enabled') === 'on',
      modules_reports_enabled: formData.get('modules_reports_enabled') === 'on',
      modules_timesheets_enabled: formData.get('modules_timesheets_enabled') === 'on',
    })
    .eq('id', companyId)

  if (error) errorRedirect(error.message)

  revalidatePath('/settings')
}

export async function updateTimesheetSettings(formData: FormData) {
  const supabase = await createClient()
  const companyId = await getCompanyId(supabase)
  if (!companyId) errorRedirect('Could not determine your company.')

  const geofenceEnabled = formData.get('geofence_enabled') === 'on'
  const radius = Number(formData.get('geofence_radius_meters') ?? 200)

  if (!Number.isFinite(radius) || radius <= 0) errorRedirect('Enter a valid geofence radius.')

  const workdayEnforced = formData.get('workday_enforced') === 'on'
  const workdayStart = String(formData.get('workday_start') ?? '')
  const workdayEnd = String(formData.get('workday_end') ?? '')
  const workdayDays = formData
    .getAll('workday_days')
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)

  if (!/^\d{2}:\d{2}$/.test(workdayStart) || !/^\d{2}:\d{2}$/.test(workdayEnd)) {
    errorRedirect('Enter valid work-day hours.')
  }
  if (workdayEnd <= workdayStart) errorRedirect('Work-day end must be after the start.')
  if (workdayEnforced && workdayDays.length === 0) errorRedirect('Pick at least one work day.')

  const payCycleLength = String(formData.get('pay_cycle_length') ?? 'weekly')
  if (!PAY_CYCLE_LENGTHS.includes(payCycleLength as PayCycleLength)) {
    errorRedirect('Invalid pay cycle length.')
  }

  const anchorRaw = String(formData.get('pay_cycle_anchor') ?? '').trim()
  if (anchorRaw && !/^\d{4}-\d{2}-\d{2}$/.test(anchorRaw)) errorRedirect('Enter a valid cycle start date.')

  const { error } = await supabase
    .from('companies')
    .update({
      geofence_enabled: geofenceEnabled,
      geofence_radius_meters: radius,
      workday_enforced: workdayEnforced,
      workday_start: workdayStart,
      workday_end: workdayEnd,
      workday_days: workdayDays,
      pay_cycle_length: payCycleLength,
      pay_cycle_anchor: anchorRaw || null,
    })
    .eq('id', companyId)

  if (error) errorRedirect(error.message)

  revalidatePath('/settings')
}

export async function updateProfile(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const fullName = String(formData.get('full_name') ?? '').trim() || null

  const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', user.id)
  if (error) errorRedirect(error.message)

  revalidatePath('/settings')
}

export async function regenerateCalendarToken() {
  const supabase = await createClient()
  const companyId = await getCompanyId(supabase)
  if (!companyId) errorRedirect('Could not determine your company.')

  const { error } = await supabase
    .from('companies')
    .update({ calendar_token: crypto.randomUUID() })
    .eq('id', companyId)

  if (error) errorRedirect(error.message)

  revalidatePath('/settings')
}

export async function uploadCompanyLogo(formData: FormData) {
  const file = formData.get('logo') as File | null
  if (!file || file.size === 0) return

  const supabase = await createClient()
  const companyId = await getCompanyId(supabase)
  if (!companyId) errorRedirect('Could not determine your company.')

  const ext = file.name.split('.').pop() ?? 'png'
  const path = `${companyId}/logo-${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('company-logos')
    .upload(path, file, { upsert: true })

  if (uploadError) errorRedirect(uploadError.message)

  const { data: urlData } = supabase.storage.from('company-logos').getPublicUrl(path)

  const { error: updateError } = await supabase
    .from('companies')
    .update({ logo_url: urlData.publicUrl })
    .eq('id', companyId)

  if (updateError) errorRedirect(updateError.message)

  revalidatePath('/settings')
}

export async function requestAccountDeletion(formData: FormData) {
  const supabase = await createClient()
  const companyId = await getCompanyId(supabase)
  if (!companyId) errorRedirect('Could not determine your company.')

  const { data: company } = await supabase
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle()

  // Typing the company name is the only friction between a bad afternoon and
  // erasing years of invoices. Compared case-insensitively and trimmed —
  // the point is deliberate intent, not a spelling test.
  const typed = String(formData.get('confirm_name') ?? '').trim().toLowerCase()
  const actual = String(company?.name ?? '').trim().toLowerCase()

  if (!actual || typed !== actual) {
    errorRedirect('Type your company name exactly as it appears to confirm deletion.')
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // RLS restricts this update to company accounts (migration 0032), so a staff
  // member cannot reach it even by calling the API directly.
  const { error } = await supabase
    .from('companies')
    .update({ deletion_requested_at: new Date().toISOString(), deletion_requested_by: user?.id ?? null })
    .eq('id', companyId)

  if (error) errorRedirect(error.message)

  // No redirect, for the same reason as cancelAccountDeletion below: this form
  // is submitted from /settings and redirecting to /settings is a no-op to the
  // router, so the closing screen never appeared. That is a bad failure for
  // this particular button — the account really had been scheduled for
  // deletion, while the screen said nothing had happened.
  revalidatePath('/', 'layout')
}

export async function cancelAccountDeletion() {
  const supabase = await createClient()
  const companyId = await getCompanyId(supabase)
  if (!companyId) errorRedirect('Could not determine your company.')

  const { error } = await supabase
    .from('companies')
    .update({ deletion_requested_at: null, deletion_requested_by: null })
    .eq('id', companyId)

  if (error) errorRedirect(error.message)

  // Revalidate and re-render in place, deliberately without a redirect. This
  // button lives on the closing screen, which the layout renders at whatever
  // URL the user was already on — redirecting to that same URL is a no-op to
  // the router, so the gate stayed on screen until the next full page load and
  // it looked like nothing had happened.
  revalidatePath('/', 'layout')
}
