'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createJobRecord } from '@/lib/job-create'

export async function createJob(formData: FormData) {
  const geoLatRaw = String(formData.get('geo_lat') ?? '')
  const geoLngRaw = String(formData.get('geo_lng') ?? '')

  const supabase = await createClient()

  const result = await createJobRecord(supabase, {
    customerId: String(formData.get('customer_id') ?? '').trim() || null,
    customerName: String(formData.get('customer_name') ?? '').trim(),
    customerEmail: String(formData.get('customer_email') ?? '').trim() || null,
    customerPhone: String(formData.get('customer_phone') ?? '').trim() || null,
    customerAddress: String(formData.get('customer_address') ?? '').trim() || null,
    addressLine: String(formData.get('address_line') ?? '').trim() || null,
    notes: String(formData.get('notes') ?? '').trim() || null,
    startDate: String(formData.get('start_date') ?? '') || null,
    startTime: String(formData.get('start_time') ?? '') || null,
    finishDate: String(formData.get('finish_date') ?? '') || null,
    finishTime: String(formData.get('finish_time') ?? '') || null,
    geoLat: geoLatRaw ? Number(geoLatRaw) : null,
    geoLng: geoLngRaw ? Number(geoLngRaw) : null,
    assignedUserId: String(formData.get('assigned_user_id') ?? '').trim() || null,
  })

  if ('error' in result) {
    redirect(`/jobs/new?error=${encodeURIComponent(result.error)}`)
  }

  revalidatePath('/jobs')
  redirect(`/jobs/${result.jobId}`)
}
