'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/roles'
import { getTimesheetSettings, type TimesheetSettings } from '@/lib/company'
import { haversineMeters } from '@/lib/geo'
import { TIMESHEET_MISC_CATEGORIES, type TimesheetMiscCategory } from '@trade-assist/db'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

function errorRedirect(message: string): never {
  redirect(`/timesheet?error=${encodeURIComponent(message)}`)
}

function localYMD(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function isoWeekday(date: Date): number {
  return date.getDay() === 0 ? 7 : date.getDay()
}

function parseHHMM(raw: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw)
  if (!match) return null
  return { hours: Number(match[1]), minutes: Number(match[2]) }
}

// Workday bounds come back from Postgres as HH:MM:SS; compare as HH:MM strings.
function checkWorkday(settings: TimesheetSettings, when: Date, what: string): void {
  if (!settings.workday_enforced) return

  if (!settings.workday_days.includes(isoWeekday(when))) {
    errorRedirect(`${what} is outside the company work days.`)
  }

  const hhmm = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`
  const start = settings.workday_start.slice(0, 5)
  const end = settings.workday_end.slice(0, 5)

  if (hhmm < start || hhmm > end) {
    errorRedirect(`${what} must be within work hours (${start}–${end}).`)
  }
}

async function checkGeofence(
  supabase: SupabaseClient,
  settings: TimesheetSettings,
  jobId: string,
  lat: number | null,
  lng: number | null
) {
  if (!settings.geofence_enabled) return

  const { data: job } = await supabase.from('jobs').select('geo_lat, geo_lng').eq('id', jobId).maybeSingle()
  if (!job?.geo_lat || !job?.geo_lng) return // no geocoded address -- nothing to fence against

  if (lat === null || lng === null) {
    errorRedirect('Enable location access to clock in/out for this job.')
  }

  const distance = haversineMeters(lat, lng, job.geo_lat, job.geo_lng)
  if (distance > settings.geofence_radius_meters) {
    errorRedirect(`You're too far from the job site to clock in (must be within ${settings.geofence_radius_meters}m).`)
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

  const startTime = parseHHMM(startTimeRaw)
  if (!startTime) errorRedirect('Enter a valid start time.')

  const now = new Date()
  const clockInDate = new Date(now)
  clockInDate.setHours(startTime.hours, startTime.minutes, 0, 0)

  const earliestAllowed = new Date(now.getTime() - 15 * 60 * 1000)
  if (clockInDate < earliestAllowed || clockInDate > now) {
    errorRedirect('Start time must be within the last 15 minutes.')
  }

  const settings = await getTimesheetSettings(supabase)
  checkWorkday(settings, clockInDate, 'Start time')

  // A submitted day is locked -- no more entries can be added to it.
  const { data: existingDay } = await supabase
    .from('timesheet_days')
    .select('id')
    .eq('profile_id', profile.id)
    .eq('work_date', localYMD(clockInDate))
    .maybeSingle()

  if (existingDay) {
    errorRedirect('This day has already been submitted for approval.')
  }

  if (jobId) {
    await checkGeofence(supabase, settings, jobId, lat, lng)
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

  const finishTimeRaw = String(formData.get('finish_time') ?? '')
  const latRaw = formData.get('lat')
  const lngRaw = formData.get('lng')
  const lat = latRaw ? Number(latRaw) : null
  const lng = lngRaw ? Number(lngRaw) : null

  const finishTime = parseHHMM(finishTimeRaw)
  if (!finishTime) errorRedirect('Enter a valid finish time.')

  const now = new Date()
  const clockOutDate = new Date(now)
  clockOutDate.setHours(finishTime.hours, finishTime.minutes, 0, 0)

  // Forward-only grace: up to 15 minutes ahead of now. A one-minute tolerance
  // behind now covers the minute truncation of the defaulted "now" value.
  if (clockOutDate.getTime() < now.getTime() - 60 * 1000) {
    errorRedirect("Finish time can't be in the past.")
  }
  if (clockOutDate.getTime() > now.getTime() + 15 * 60 * 1000) {
    errorRedirect('Finish time can be at most 15 minutes ahead of the current time.')
  }

  const settings = await getTimesheetSettings(supabase)
  checkWorkday(settings, clockOutDate, 'Finish time')

  const { data: entry } = await supabase
    .from('timesheet_entries')
    .select('job_id')
    .eq('id', entryId)
    .maybeSingle()

  if (entry?.job_id) {
    await checkGeofence(supabase, settings, entry.job_id, lat, lng)
  }

  const { error } = await supabase.rpc('clock_out_timesheet_entry', {
    p_entry_id: entryId,
    p_clock_out: clockOutDate.toISOString(),
    p_lat: lat,
    p_lng: lng,
  })

  if (error) errorRedirect(error.message)

  revalidatePath('/timesheet')
  if (entry?.job_id) revalidatePath(`/jobs/${entry.job_id}`)
}

export async function submitDay(formData: FormData) {
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile) redirect('/login')

  const workDate = String(formData.get('work_date') ?? '')
  const tzOffsetMinutes = Number(formData.get('tz_offset_minutes') ?? NaN)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) errorRedirect('Invalid day.')
  if (!Number.isFinite(tzOffsetMinutes) || Math.abs(tzOffsetMinutes) > 14 * 60) {
    errorRedirect('Invalid timezone offset.')
  }

  // The staff device's local day, expressed as a UTC window:
  // getTimezoneOffset() returns UTC minus local, so UTC = local + offset.
  const windowStart = new Date(new Date(`${workDate}T00:00:00Z`).getTime() + tzOffsetMinutes * 60 * 1000)
  const windowEnd = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000)

  const { error } = await supabase.rpc('submit_timesheet_day', {
    p_work_date: workDate,
    p_window_start: windowStart.toISOString(),
    p_window_end: windowEnd.toISOString(),
  })

  if (error) {
    if (error.code === '23505') errorRedirect('This day has already been submitted.')
    errorRedirect(error.message)
  }

  revalidatePath('/timesheet')
}
