'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function createJob(formData: FormData) {
  const customerName = String(formData.get('customer_name') ?? '').trim()
  const customerEmail = String(formData.get('customer_email') ?? '').trim() || null
  const customerPhone = String(formData.get('customer_phone') ?? '').trim() || null
  const customerAddress = String(formData.get('customer_address') ?? '').trim() || null
  const addressLine = String(formData.get('address_line') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null
  const startDate = String(formData.get('start_date') ?? '') || null
  const startTime = String(formData.get('start_time') ?? '') || null
  const finishDate = String(formData.get('finish_date') ?? '') || null
  const finishTime = String(formData.get('finish_time') ?? '') || null
  const geoLatRaw = String(formData.get('geo_lat') ?? '')
  const geoLngRaw = String(formData.get('geo_lng') ?? '')
  const geoLat = geoLatRaw ? Number(geoLatRaw) : null
  const geoLng = geoLngRaw ? Number(geoLngRaw) : null

  if (!customerName) {
    redirect(`/jobs/new?error=${encodeURIComponent('Customer name is required.')}`)
  }

  const supabase = await createClient()

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('company_id')
    .single()

  if (profileError || !profile) {
    redirect(`/jobs/new?error=${encodeURIComponent('Could not determine your company.')}`)
  }

  const { data: existingCustomer } = await supabase
    .from('customers')
    .select('id')
    .ilike('name', customerName)
    .maybeSingle()

  let customerId = existingCustomer?.id as string | undefined

  if (!customerId) {
    const { data: createdCustomer, error: customerError } = await supabase
      .from('customers')
      .insert({
        company_id: profile.company_id,
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
        address: customerAddress,
      })
      .select('id')
      .single()

    if (customerError || !createdCustomer) {
      redirect(`/jobs/new?error=${encodeURIComponent(customerError?.message ?? 'Could not create customer.')}`)
    }
    customerId = createdCustomer!.id
  }

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .insert({
      company_id: profile.company_id,
      customer_id: customerId,
      address_line: addressLine,
      notes,
      start_date: startDate,
      start_time: startTime,
      finish_date: finishDate,
      finish_time: finishTime,
      geo_lat: geoLat,
      geo_lng: geoLng,
    })
    .select('id')
    .single()

  if (jobError || !job) {
    redirect(`/jobs/new?error=${encodeURIComponent(jobError?.message ?? 'Could not create job.')}`)
  }

  revalidatePath('/jobs')
  redirect(`/jobs/${job!.id}`)
}
