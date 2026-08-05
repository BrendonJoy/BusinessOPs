'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/roles'

function errorRedirect(returnTo: string, message: string): never {
  redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`)
}

async function requireProfile() {
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile) redirect('/login')
  return { supabase, profile }
}

/**
 * Times arrive as full ISO instants, converted from the browser's wall clock by
 * ShiftTimeFields. A `datetime-local` value carries no timezone, so posting the
 * raw "2026-09-10T18:00" and letting Postgres read it would interpret it in the
 * server's zone — UTC in production — and quietly move every shift by the
 * offset. A pack-out that finishes at 2am is exactly where that goes wrong.
 */
function parseInstant(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export async function createShift(returnTo: string, formData: FormData) {
  const { supabase, profile } = await requireProfile()

  const teamId = String(formData.get('team_id') ?? '')
  if (!teamId) errorRedirect(returnTo, 'Choose a department for the shift.')

  const startsAt = parseInstant(formData.get('starts_at'))
  const endsAt = parseInstant(formData.get('ends_at'))
  if (!startsAt || !endsAt) errorRedirect(returnTo, 'Give the shift a start and finish time.')

  if (new Date(endsAt) <= new Date(startsAt)) {
    errorRedirect(returnTo, 'The finish time has to be after the start time.')
  }

  const eventDayId = String(formData.get('event_day_id') ?? '') || null

  const positionsNeeded = Math.max(1, Math.floor(Number(formData.get('positions_needed') ?? 1) || 1))
  const openToDepartment = formData.get('open_to_department') === 'on'

  // Sent by the client rather than derived here — see migration 0038. Rejected
  // outright if missing, because a silent fallback to the server's today would
  // file shifts under the wrong day for anyone not on UTC.
  const localDate = String(formData.get('local_date') ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    errorRedirect(returnTo, 'Could not read the shift date. Refresh and try again.')
  }

  const { error } = await supabase.from('shifts').insert({
    company_id: profile.company_id,
    team_id: teamId,
    event_day_id: eventDayId,
    // Only set on dark-day shifts. An event shift leaves it null and inherits
    // the event's venue, so moving the event moves its shifts with it.
    venue_id: String(formData.get('venue_id') ?? '').trim() || null,
    title: String(formData.get('title') ?? '').trim() || null,
    starts_at: startsAt,
    ends_at: endsAt,
    local_date: localDate,
    positions_needed: positionsNeeded,
    open_to_department: openToDepartment,
    notes: String(formData.get('notes') ?? '').trim() || null,
  })

  // RLS allows the company account and that department's manager only, so a
  // manager reaching across departments is refused here rather than in the UI.
  if (error) {
    const message =
      error.code === '42501'
        ? 'You can only create shifts for a department you manage.'
        : error.message
    errorRedirect(returnTo, message)
  }

  revalidatePath(returnTo)
}

export async function deleteShift(returnTo: string, shiftId: string) {
  const { supabase } = await requireProfile()

  const { error } = await supabase.from('shifts').delete().eq('id', shiftId)
  if (error) errorRedirect(returnTo, error.message)

  revalidatePath(returnTo)
}

export async function assignToShift(returnTo: string, shiftId: string, formData: FormData) {
  const { supabase } = await requireProfile()

  // Several at once: a bar call is ten or fifteen people out of a pool of
  // thirty, and adding them one at a time was the first thing to become
  // tedious in real use.
  const profileIds = formData.getAll('profile_id').map(String).filter(Boolean)
  if (profileIds.length === 0) errorRedirect(returnTo, 'Choose at least one person.')

  const { error } = await supabase.from('shift_assignments').upsert(
    profileIds.map((profileId) => ({
      shift_id: shiftId,
      profile_id: profileId,
      status: 'invited',
    })),
    // Someone already asked, or who has already answered, must not be reset to
    // 'invited' by a second pass over the same shift.
    { onConflict: 'shift_id,profile_id', ignoreDuplicates: true }
  )

  if (error) {
    const message =
      error.code === '42501'
        ? 'You can only roster onto a department you manage.'
        : error.message
    errorRedirect(returnTo, message)
  }

  revalidatePath(returnTo)
}

export async function setAssignmentStatus(
  returnTo: string,
  shiftId: string,
  profileId: string,
  status: 'confirmed' | 'invited'
) {
  const { supabase } = await requireProfile()

  const { error } = await supabase
    .from('shift_assignments')
    .update({ status, confirmed_at: status === 'confirmed' ? new Date().toISOString() : null })
    .eq('shift_id', shiftId)
    .eq('profile_id', profileId)

  if (error) {
    const message =
      error.code === '42501' ? 'You can only change a department you manage.' : error.message
    errorRedirect(returnTo, message)
  }

  revalidatePath(returnTo)
}

export async function setShiftOpen(returnTo: string, shiftId: string, open: boolean) {
  const { supabase } = await requireProfile()

  const { error } = await supabase
    .from('shifts')
    .update({ open_to_department: open })
    .eq('id', shiftId)

  if (error) errorRedirect(returnTo, error.message)

  revalidatePath(returnTo)
}

/**
 * A staff member's own answer. Goes through the RPC rather than a direct write,
 * because RLS filters rows and not columns — a direct update path would let
 * someone set their own status to 'confirmed' and roster themselves on.
 */
export async function respondToShift(returnTo: string, shiftId: string, available: boolean) {
  const { supabase } = await requireProfile()

  const { error } = await supabase.rpc('respond_to_shift', {
    p_shift_id: shiftId,
    p_available: available,
  })

  if (error) errorRedirect(returnTo, error.message)

  revalidatePath(returnTo)
}

export async function unassignFromShift(returnTo: string, shiftId: string, profileId: string) {
  const { supabase } = await requireProfile()

  const { error } = await supabase
    .from('shift_assignments')
    .delete()
    .eq('shift_id', shiftId)
    .eq('profile_id', profileId)

  if (error) errorRedirect(returnTo, error.message)

  revalidatePath(returnTo)
}
