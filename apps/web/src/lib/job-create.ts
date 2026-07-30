import type { createClient } from '@/lib/supabase/server'
import { geocodeAddress } from '@/lib/google-maps'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export type JobCreateFields = {
  customerId?: string | null
  customerName: string
  customerEmail?: string | null
  customerPhone?: string | null
  customerAddress?: string | null
  addressLine?: string | null
  notes?: string | null
  startDate?: string | null
  startTime?: string | null
  finishDate?: string | null
  finishTime?: string | null
  geoLat?: number | null
  geoLng?: number | null
  assignedUserId?: string | null
}

export type JobCreateResult =
  | { jobId: string; jobNumber: string | null; customerName: string }
  | { error: string }

// Shared by the New Job form action and the chat agent's create_job tool:
// find-or-create the customer by name, geocode the job address when no
// coordinates were supplied, insert the job.
export async function createJobRecord(
  supabase: SupabaseClient,
  fields: JobCreateFields
): Promise<JobCreateResult> {
  const customerName = fields.customerName.trim()
  if (!customerName) return { error: 'Customer name is required.' }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) return { error: 'Could not determine your company.' }

  let resolvedCustomerId = fields.customerId ?? undefined

  if (resolvedCustomerId) {
    // Selected from the existing-customer list -- sync any edits made on this
    // form back to their saved record instead of silently discarding them.
    const { error: customerUpdateError } = await supabase
      .from('customers')
      .update({
        name: customerName,
        email: fields.customerEmail ?? null,
        phone: fields.customerPhone ?? null,
        address: fields.customerAddress ?? null,
      })
      .eq('id', resolvedCustomerId)

    if (customerUpdateError) return { error: customerUpdateError.message }
  } else {
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .ilike('name', customerName)
      .maybeSingle()

    resolvedCustomerId = existingCustomer?.id as string | undefined

    if (!resolvedCustomerId) {
      const { data: createdCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          company_id: profile.company_id,
          name: customerName,
          email: fields.customerEmail ?? null,
          phone: fields.customerPhone ?? null,
          address: fields.customerAddress ?? null,
        })
        .select('id')
        .single()

      if (customerError || !createdCustomer) {
        return { error: customerError?.message ?? 'Could not create customer.' }
      }
      resolvedCustomerId = createdCustomer.id
    }
  }

  let geoLat = fields.geoLat ?? null
  let geoLng = fields.geoLng ?? null
  if (geoLat == null && fields.addressLine) {
    const geo = await geocodeAddress(fields.addressLine)
    if (geo) {
      geoLat = geo.lat
      geoLng = geo.lng
    }
  }

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .insert({
      company_id: profile.company_id,
      customer_id: resolvedCustomerId,
      address_line: fields.addressLine ?? null,
      notes: fields.notes ?? null,
      start_date: fields.startDate ?? null,
      start_time: fields.startTime ?? null,
      finish_date: fields.finishDate ?? null,
      finish_time: fields.finishTime ?? null,
      geo_lat: geoLat,
      geo_lng: geoLng,
      assigned_user_id: fields.assignedUserId ?? null,
    })
    .select('id, job_number')
    .single()

  if (jobError || !job) {
    return { error: jobError?.message ?? 'Could not create job.' }
  }

  return { jobId: job.id, jobNumber: job.job_number, customerName }
}
