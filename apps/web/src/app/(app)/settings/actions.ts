'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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

  if (!name) errorRedirect('Company name is required.')

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

export async function updateGeofenceSettings(formData: FormData) {
  const supabase = await createClient()
  const companyId = await getCompanyId(supabase)
  if (!companyId) errorRedirect('Could not determine your company.')

  const geofenceEnabled = formData.get('geofence_enabled') === 'on'
  const radius = Number(formData.get('geofence_radius_meters') ?? 200)

  if (!Number.isFinite(radius) || radius <= 0) errorRedirect('Enter a valid geofence radius.')

  const { error } = await supabase
    .from('companies')
    .update({ geofence_enabled: geofenceEnabled, geofence_radius_meters: radius })
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
