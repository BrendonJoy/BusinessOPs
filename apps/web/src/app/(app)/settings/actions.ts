'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

function errorRedirect(message: string): never {
  redirect(`/settings?error=${encodeURIComponent(message)}`)
}

export async function updateCompany(formData: FormData) {
  const supabase = await createClient()
  const { data: profile } = await supabase.from('profiles').select('company_id').single()
  if (!profile) errorRedirect('Could not determine your company.')

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
    .eq('id', profile.company_id)

  if (error) errorRedirect(error.message)

  revalidatePath('/settings')
}

export async function updateCompanyModules(formData: FormData) {
  const supabase = await createClient()
  const { data: profile } = await supabase.from('profiles').select('company_id').single()
  if (!profile) errorRedirect('Could not determine your company.')

  const { error } = await supabase
    .from('companies')
    .update({
      modules_quotes_enabled: formData.get('modules_quotes_enabled') === 'on',
      modules_invoicing_enabled: formData.get('modules_invoicing_enabled') === 'on',
      modules_expenses_enabled: formData.get('modules_expenses_enabled') === 'on',
      modules_reports_enabled: formData.get('modules_reports_enabled') === 'on',
    })
    .eq('id', profile.company_id)

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
  const { data: profile } = await supabase.from('profiles').select('company_id').single()
  if (!profile) errorRedirect('Could not determine your company.')

  const { error } = await supabase
    .from('companies')
    .update({ calendar_token: crypto.randomUUID() })
    .eq('id', profile.company_id)

  if (error) errorRedirect(error.message)

  revalidatePath('/settings')
}

export async function uploadCompanyLogo(formData: FormData) {
  const file = formData.get('logo') as File | null
  if (!file || file.size === 0) return

  const supabase = await createClient()
  const { data: profile } = await supabase.from('profiles').select('company_id').single()
  if (!profile) errorRedirect('Could not determine your company.')

  const ext = file.name.split('.').pop() ?? 'png'
  const path = `${profile.company_id}/logo-${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('company-logos')
    .upload(path, file, { upsert: true })

  if (uploadError) errorRedirect(uploadError.message)

  const { data: urlData } = supabase.storage.from('company-logos').getPublicUrl(path)

  const { error: updateError } = await supabase
    .from('companies')
    .update({ logo_url: urlData.publicUrl })
    .eq('id', profile.company_id)

  if (updateError) errorRedirect(updateError.message)

  revalidatePath('/settings')
}
