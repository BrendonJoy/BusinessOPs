'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/roles'
import { getCompanyTimezone, getTimesheetSettings, type TimesheetSettings } from '@/lib/company'
import { wallClockToInstant } from '@/lib/timezone'
import { addDaysToYmd } from '@/lib/dates'
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

/** Clock in and out may both be set up to this far either side of now. */
const GRACE_MINUTES = 15

/**
 * Turns a bare HH:MM into the actual instant the person meant.
 *
 * Naively stamping the time onto today breaks either side of midnight, which is
 * exactly when a pack-out crew is clocking off: at 00:05, "23:55" means five
 * minutes ago, not twenty-three hours away. Anything landing more than twelve
 * hours out is therefore pulled to the adjacent day.
 */
function nearestOccurrence(time: { hours: number; minutes: number }, now: Date): Date {
  const candidate = new Date(now)
  candidate.setHours(time.hours, time.minutes, 0, 0)

  const HALF_DAY = 12 * 60 * 60 * 1000
  const drift = candidate.getTime() - now.getTime()

  if (drift > HALF_DAY) candidate.setDate(candidate.getDate() - 1)
  else if (drift < -HALF_DAY) candidate.setDate(candidate.getDate() + 1)

  return candidate
}

function withinGrace(when: Date, now: Date): boolean {
  return Math.abs(when.getTime() - now.getTime()) <= GRACE_MINUTES * 60 * 1000
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

/**
 * A shift is fenced against its venue: its own if it has one, otherwise its
 * event's. Dark-day shifts set theirs directly; event shifts normally inherit.
 *
 * No venue, or a venue whose address never geocoded, means no fence — the same
 * way a job without coordinates is skipped. Refusing the clock-in instead would
 * strand someone over a setting they cannot see or change.
 */
async function checkShiftGeofence(
  supabase: SupabaseClient,
  settings: TimesheetSettings,
  shiftId: string,
  lat: number | null,
  lng: number | null
) {
  if (!settings.geofence_enabled) return

  const { data: shift } = await supabase
    .from('shifts')
    .select('venue_id, event_day_id')
    .eq('id', shiftId)
    .maybeSingle()

  if (!shift) return

  let venueId = shift.venue_id as string | null

  if (!venueId && shift.event_day_id) {
    const { data: day } = await supabase
      .from('event_days')
      .select('event_id')
      .eq('id', shift.event_day_id)
      .maybeSingle()

    if (day) {
      const { data: event } = await supabase
        .from('events')
        .select('venue_id')
        .eq('id', day.event_id)
        .maybeSingle()
      venueId = (event?.venue_id as string | null) ?? null
    }
  }

  if (!venueId) return

  const { data: venue } = await supabase
    .from('venues')
    .select('name, geo_lat, geo_lng')
    .eq('id', venueId)
    .maybeSingle()

  if (!venue?.geo_lat || !venue?.geo_lng) return

  if (lat === null || lng === null) {
    errorRedirect('Enable location access to clock in and out of this shift.')
  }

  const distance = haversineMeters(lat, lng, venue.geo_lat, venue.geo_lng)
  if (distance > settings.geofence_radius_meters) {
    errorRedirect(
      `You're too far from ${venue.name} to clock in (must be within ${settings.geofence_radius_meters}m).`
    )
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
  const clockInDate = nearestOccurrence(startTime, now)

  if (!withinGrace(clockInDate, now)) {
    errorRedirect(`Start time must be within ${GRACE_MINUTES} minutes of now, either side.`)
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

  if (jobId) {
    await checkGeofence(supabase, settings, jobId, lat, lng)
  }
  if (shiftId) {
    await checkShiftGeofence(supabase, settings, shiftId, lat, lng)
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
  const clockOutDate = nearestOccurrence(finishTime, now)

  // Both directions, matching clock-in. It used to be forward-only, which meant
  // someone who finished at 23:00 and reached their phone at 23:10 could not
  // record the time they actually stopped — they had to overstate it.
  if (!withinGrace(clockOutDate, now)) {
    errorRedirect(`Finish time must be within ${GRACE_MINUTES} minutes of now, either side.`)
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
  if (entry?.shift_id) {
    await checkShiftGeofence(supabase, settings, entry.shift_id, lat, lng)
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) errorRedirect('Invalid day.')

  /*
   * The working day as a UTC window, built from the company's zone.
   *
   * This used to come from the submitting device's UTC offset. That put a day's
   * boundaries wherever the phone happened to be, so the same day submitted from
   * a different country covered a different span of hours — and the hours in the
   * gap were simply not submitted, silently.
   *
   * The end is computed from the next calendar date rather than by adding 24
   * hours, so the two days a year that are 23 or 25 hours long still work.
   */
  const zone = await getCompanyTimezone(supabase)
  const startIso = wallClockToInstant(zone, workDate, '00:00')
  const endIso = wallClockToInstant(zone, addDaysToYmd(workDate, 1), '00:00')
  if (!startIso || !endIso) errorRedirect('Invalid day.')

  const windowStart = new Date(startIso)
  const windowEnd = new Date(endIso)

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
