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
  const shiftId = String(formData.get('shift_id') ?? '').trim() || null
  const miscCategoryRaw = String(formData.get('misc_category') ?? '').trim() || null
  const startTimeRaw = String(formData.get('start_time') ?? '')
  const latRaw = formData.get('lat')
  const lngRaw = formData.get('lng')
  const lat = latRaw ? Number(latRaw) : null
  const lng = lngRaw ? Number(lngRaw) : null

  const targetCount = [jobId, shiftId, miscCategoryRaw].filter(Boolean).length
  if (targetCount === 0) errorRedirect('Choose a shift, job or category to clock in against.')
  if (targetCount > 1) errorRedirect('Choose only one thing to clock in against.')

  if (miscCategoryRaw && !TIMESHEET_MISC_CATEGORIES.includes(miscCategoryRaw as TimesheetMiscCategory)) {
    errorRedirect('Invalid category.')
  }

  // Seeing a department's roster is not permission to clock in against someone
  // else's shift, so the assignment is re-checked here rather than trusting the
  // list the form was built from.
  if (shiftId) {
    const { data: assignment } = await supabase
      .from('shift_assignments')
      .select('shift_id')
      .eq('shift_id', shiftId)
      .eq('profile_id', profile.id)
      .maybeSingle()

    if (!assignment) errorRedirect("You're not rostered on that shift.")
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

  // Company work-day hours describe a trades business's normal day. A rostered
  // shift IS the schedule — a pack-in at 5am or a pack-out past midnight is the
  // plan, not an exception — so the check only applies to job and misc entries.
  if (!shiftId) checkWorkday(settings, clockInDate, 'Start time')

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

  // Geofencing checks against a job's geocoded address. A shift has no address
  // of its own — the event's venue is free text, not coordinates — so there is
  // nothing to fence against yet. Worth revisiting if venues get geocoded.
  if (jobId) {
    await checkGeofence(supabase, settings, jobId, lat, lng)
  }

  // Coordinates are deliberately not persisted — checkGeofence above is the
  // only thing that uses them, and it has already run. See migration 0030.
  const { error } = await supabase.from('timesheet_entries').insert({
    company_id: profile.company_id,
    profile_id: profile.id,
    job_id: jobId,
    shift_id: shiftId,
    misc_category: miscCategoryRaw as TimesheetMiscCategory | null,
    clock_in: clockInDate.toISOString(),
  })

  if (error) {
    if (error.code === '23505') errorRedirect("You're already clocked in — clock out first.")
    errorRedirect(error.message)
  }

  revalidatePath('/timesheet')
  // Clears any ?error left over from a previous attempt. Without it the old
  // message sits above the new state — "outside work hours" printed directly
  // over "Clocked in to Bar".
  redirect('/timesheet')
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

  const { data: entry } = await supabase
    .from('timesheet_entries')
    .select('job_id, shift_id')
    .eq('id', entryId)
    .maybeSingle()

  // Same reasoning as clock-in: a shift is its own schedule. The RPC skips this
  // check for shift entries too (migration 0037), so refusing here would only
  // strand someone with an open entry at 2am.
  if (!entry?.shift_id) checkWorkday(settings, clockOutDate, 'Finish time')

  if (entry?.job_id) {
    await checkGeofence(supabase, settings, entry.job_id, lat, lng)
  }

  const { error } = await supabase.rpc('clock_out_timesheet_entry', {
    p_entry_id: entryId,
    p_clock_out: clockOutDate.toISOString(),
  })

  if (error) errorRedirect(error.message)

  revalidatePath('/timesheet')
  if (entry?.job_id) revalidatePath(`/jobs/${entry.job_id}`)
  redirect('/timesheet')
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
