'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/roles'
import { getGeofenceSettings } from '@/lib/company'
import { haversineMeters } from '@/lib/geo'
import { TIMESHEET_MISC_CATEGORIES, type TimesheetMiscCategory } from '@trade-assist/db'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

function errorRedirect(message: string): never {
  redirect(`/timesheet?error=${encodeURIComponent(message)}`)
}

async function checkGeofence(
  supabase: SupabaseClient,
  jobId: string,
  lat: number | null,
  lng: number | null
) {
  const { geofence_enabled, geofence_radius_meters } = await getGeofenceSettings(supabase)
  if (!geofence_enabled) return

  const { data: job } = await supabase.from('jobs').select('geo_lat, geo_lng').eq('id', jobId).maybeSingle()
  if (!job?.geo_lat || !job?.geo_lng) return // no geocoded address -- nothing to fence against

  if (lat === null || lng === null) {
    errorRedirect('Enable location access to clock in/out for this job.')
  }

  const distance = haversineMeters(lat, lng, job.geo_lat, job.geo_lng)
  if (distance > geofence_radius_meters) {
    errorRedirect(`You're too far from the job site to clock in (must be within ${geofence_radius_meters}m).`)
  }
}

export async function clockIn(formData: FormData) {
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile) redirect('/login')

  const jobId = String(formData.get('job_id') ?? '').trim() || null
  const miscCategoryRaw = String(formData.get('misc_category') ?? '').trim() || null
  const startTimeRaw = String(formData.get('start_time') ?? '')
  const latRaw = formData.get('lat')
  const lngRaw = formData.get('lng')
  const lat = latRaw ? Number(latRaw) : null
  const lng = lngRaw ? Number(lngRaw) : null

  if (!jobId && !miscCategoryRaw) errorRedirect('Choose a job or category to clock in against.')
  if (jobId && miscCategoryRaw) errorRedirect('Choose only one of a job or a category.')
  if (miscCategoryRaw && !TIMESHEET_MISC_CATEGORIES.includes(miscCategoryRaw as TimesheetMiscCategory)) {
    errorRedirect('Invalid category.')
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(startTimeRaw)
  if (!match) errorRedirect('Enter a valid start time.')
  const [, hourStr, minuteStr] = match

  const now = new Date()
  const clockInDate = new Date(now)
  clockInDate.setHours(Number(hourStr), Number(minuteStr), 0, 0)

  const earliestAllowed = new Date(now.getTime() - 15 * 60 * 1000)
  if (clockInDate < earliestAllowed || clockInDate > now) {
    errorRedirect('Start time must be within the last 15 minutes.')
  }

  if (jobId) {
    await checkGeofence(supabase, jobId, lat, lng)
  }

  const { error } = await supabase.from('timesheet_entries').insert({
    company_id: profile.company_id,
    profile_id: profile.id,
    job_id: jobId,
    misc_category: miscCategoryRaw as TimesheetMiscCategory | null,
    clock_in: clockInDate.toISOString(),
    clock_in_lat: lat,
    clock_in_lng: lng,
  })

  if (error) {
    if (error.code === '23505') errorRedirect("You're already clocked in — clock out first.")
    errorRedirect(error.message)
  }

  revalidatePath('/timesheet')
}

export async function clockOut(entryId: string, formData: FormData) {
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile) redirect('/login')

  const latRaw = formData.get('lat')
  const lngRaw = formData.get('lng')
  const lat = latRaw ? Number(latRaw) : null
  const lng = lngRaw ? Number(lngRaw) : null

  const { data: entry } = await supabase
    .from('timesheet_entries')
    .select('job_id')
    .eq('id', entryId)
    .maybeSingle()

  if (entry?.job_id) {
    await checkGeofence(supabase, entry.job_id, lat, lng)
  }

  const { error } = await supabase.rpc('clock_out_timesheet_entry', {
    p_entry_id: entryId,
    p_lat: lat,
    p_lng: lng,
  })

  if (error) errorRedirect(error.message)

  revalidatePath('/timesheet')
  if (entry?.job_id) revalidatePath(`/jobs/${entry.job_id}`)
}
