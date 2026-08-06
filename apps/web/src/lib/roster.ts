import type { createClient } from '@/lib/supabase/server'
import type { ShiftAssignmentStatus } from '@trade-assist/db'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'
import { getCompanyTimezone } from '@/lib/company'
import { isValidTimezone, todayInZone } from '@/lib/timezone'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export type RosterPerson = { id: string; name: string }

export type RosterAssignment = RosterPerson & { status: ShiftAssignmentStatus }

export type RosterShift = {
  id: string
  teamId: string
  teamName: string
  eventDayId: string | null
  /** Null for a dark-day shift — one scheduled with no event running. */
  eventName: string | null
  title: string | null
  startsAt: string
  endsAt: string
  /** The day the shift belongs to, as the venue means it. See migration 0038. */
  localDate: string
  /**
   * The zone `startsAt` and `endsAt` should be read in — the shift's own venue,
   * else its event's venue, else the company. Carried on the shift rather than
   * left to each screen so the same shift cannot read 4pm in one place and 2pm
   * in another.
   */
  zone: string
  positionsNeeded: number
  openToDepartment: boolean
  notes: string | null
  /** Everyone attached to the shift, whatever their answer. */
  assigned: RosterAssignment[]
}

export type RosterContext = {
  /** Departments the viewer can roster for — all of them for a company account. */
  manageable: { id: string; name: string }[]
  /** Every department the viewer can see, for labelling shifts. */
  visible: { id: string; name: string }[]
  /** Who can be put on a shift, per department. */
  membersByTeam: Map<string, RosterPerson[]>
  canManage: (teamId: string) => boolean
}

/**
 * Everything the roster UI needs about departments and who is in them.
 *
 * Queried separately and joined here rather than with PostgREST embeds. This
 * schema has been bitten twice by embeds failing *silently* — returning no rows
 * rather than an error — when foreign keys are ambiguous, and a roster that
 * quietly renders empty is the worst possible failure for this screen.
 */
export async function getRosterContext(supabase: SupabaseClient): Promise<RosterContext> {
  const profile = await getCurrentProfile(supabase)
  const isCompany = isCompanyAccount(profile?.role)

  // RLS already limits this to the caller's company.
  const [{ data: teamsData }, { data: membershipData }] = await Promise.all([
    supabase.from('teams').select('id, name').order('name'),
    supabase.from('team_memberships').select('team_id, profile_id, role'),
  ])

  const teams = (teamsData ?? []) as { id: string; name: string }[]
  const memberships = (membershipData ?? []) as {
    team_id: string
    profile_id: string
    role: 'manager' | 'staff'
  }[]

  const profileIds = [...new Set(memberships.map((m) => m.profile_id))]
  const { data: peopleData } = profileIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', profileIds)
    : { data: [] }

  const nameById = new Map<string, string>()
  for (const person of (peopleData ?? []) as { id: string; full_name: string | null; email: string }[]) {
    nameById.set(person.id, person.full_name ?? person.email)
  }

  const membersByTeam = new Map<string, RosterPerson[]>()
  const managedTeamIds = new Set<string>()

  for (const membership of memberships) {
    const list = membersByTeam.get(membership.team_id) ?? []
    list.push({ id: membership.profile_id, name: nameById.get(membership.profile_id) ?? 'Unknown' })
    membersByTeam.set(membership.team_id, list)

    if (membership.role === 'manager' && membership.profile_id === profile?.id) {
      managedTeamIds.add(membership.team_id)
    }
  }

  for (const [teamId, people] of membersByTeam) {
    membersByTeam.set(
      teamId,
      people.sort((a, b) => a.name.localeCompare(b.name))
    )
  }

  const canManage = (teamId: string) => isCompany || managedTeamIds.has(teamId)

  return {
    manageable: teams.filter((t) => canManage(t.id)),
    visible: teams,
    membersByTeam,
    canManage,
  }
}

export type ClockableShift = {
  id: string
  title: string | null
  teamName: string
  eventName: string | null
  startsAt: string
  endsAt: string
}

/**
 * The shifts this person could plausibly be clocking on to right now.
 *
 * Only shifts they are actually rostered on: being able to *see* a department's
 * roster is not permission to clock in against someone else's shift, and the
 * clock-in action re-checks this rather than trusting the list.
 *
 * The window is deliberately wide — twelve hours either side — because people
 * arrive early for a pack-in and clock out well after midnight on a pack-out.
 * Narrower and the shift they want vanishes from the list exactly when they are
 * standing in the rain trying to start.
 */
export async function getClockableShifts(
  supabase: SupabaseClient,
  profileId: string
): Promise<ClockableShift[]> {
  const now = Date.now()
  const from = new Date(now - 12 * 60 * 60 * 1000).toISOString()
  const to = new Date(now + 12 * 60 * 60 * 1000).toISOString()

  // Confirmed only. Being asked, or having said you are free, is not the same
  // as being on the roster — clocking in against a shift someone else was given
  // would put hours against work they did.
  const { data: assignmentData } = await supabase
    .from('shift_assignments')
    .select('shift_id')
    .eq('profile_id', profileId)
    .eq('status', 'confirmed')

  const shiftIds = ((assignmentData ?? []) as { shift_id: string }[]).map((a) => a.shift_id)
  if (shiftIds.length === 0) return []

  const { data: shiftData } = await supabase
    .from('shifts')
    .select('id, team_id, event_day_id, title, starts_at, ends_at')
    .in('id', shiftIds)
    .lte('starts_at', to)
    .gte('ends_at', from)
    .order('starts_at')

  const shifts = (shiftData ?? []) as {
    id: string
    team_id: string
    event_day_id: string | null
    title: string | null
    starts_at: string
    ends_at: string
  }[]

  if (shifts.length === 0) return []

  const dayIds = [...new Set(shifts.map((s) => s.event_day_id).filter((id): id is string => Boolean(id)))]

  const [{ data: teamsData }, { data: daysData }] = await Promise.all([
    supabase.from('teams').select('id, name'),
    dayIds.length
      ? supabase.from('event_days').select('id, event_id').in('id', dayIds)
      : Promise.resolve({ data: [] as { id: string; event_id: string }[] }),
  ])

  const days = (daysData ?? []) as { id: string; event_id: string }[]
  const eventIds = [...new Set(days.map((d) => d.event_id))]

  const { data: eventsData } = eventIds.length
    ? await supabase.from('events').select('id, name').in('id', eventIds)
    : { data: [] }

  const teamName = new Map(
    ((teamsData ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name])
  )
  const eventNameByDay = new Map<string, string>()
  const eventName = new Map(
    ((eventsData ?? []) as { id: string; name: string }[]).map((e) => [e.id, e.name])
  )
  for (const day of days) {
    const name = eventName.get(day.event_id)
    if (name) eventNameByDay.set(day.id, name)
  }

  return shifts.map((shift) => ({
    id: shift.id,
    title: shift.title,
    teamName: teamName.get(shift.team_id) ?? 'Department',
    eventName: shift.event_day_id ? (eventNameByDay.get(shift.event_day_id) ?? null) : null,
    startsAt: shift.starts_at,
    endsAt: shift.ends_at,
  }))
}

const SHIFT_COLUMNS =
  'id, team_id, event_day_id, venue_id, title, starts_at, ends_at, local_date, notes, positions_needed, open_to_department'

type ShiftRow = {
  id: string
  team_id: string
  event_day_id: string | null
  venue_id: string | null
  title: string | null
  starts_at: string
  ends_at: string
  local_date: string
  notes: string | null
  positions_needed: number
  open_to_department: boolean
}

/**
 * A failed query must not be allowed to read as "no shifts".
 *
 * Every fetch here previously destructured `data` alone, so an RLS refusal or a
 * dropped connection rendered an empty roster — indistinguishable from a quiet
 * week. The assistant now reads through these too, and it has already once told
 * someone a department was empty when it simply could not see into it. Throwing
 * turns a silent lie into a visible failure.
 */
function assertLoaded(error: { message: string } | null): void {
  if (error) throw new Error(`Could not load shifts: ${error.message}`)
}

/**
 * Shifts for a set of event days, with who is on them.
 *
 * Returns [] for an empty day list rather than querying with an empty `in`,
 * which PostgREST treats as "match nothing" but is easy to misread as a bug.
 */
export async function getShiftsForEventDays(
  supabase: SupabaseClient,
  eventDayIds: string[]
): Promise<RosterShift[]> {
  if (eventDayIds.length === 0) return []

  const { data, error } = await supabase
    .from('shifts')
    .select(SHIFT_COLUMNS)
    .in('event_day_id', eventDayIds)
    .order('starts_at')

  assertLoaded(error)

  return hydrateShifts(supabase, (data ?? []) as ShiftRow[])
}

/**
 * Every shift the viewer can see between two dates, event-linked or not.
 *
 * Filtered on `local_date` rather than on `starts_at`, which is the whole point
 * of storing it: a pack-out running past midnight stays on the day it began
 * instead of appearing on tomorrow's roster, and the answer does not change
 * with the server's timezone.
 */
export async function getShiftsInDateRange(
  supabase: SupabaseClient,
  fromDate: string,
  toDate: string
): Promise<RosterShift[]> {
  const { data, error } = await supabase
    .from('shifts')
    .select(SHIFT_COLUMNS)
    .gte('local_date', fromDate)
    .lte('local_date', toDate)
    .order('local_date')
    .order('starts_at')

  assertLoaded(error)

  return hydrateShifts(supabase, (data ?? []) as ShiftRow[])
}

/**
 * Shifts this person is being asked about, and open calls they could offer for.
 *
 * Deliberately only forward-looking. A shift that has already run cannot be
 * answered usefully, and a list that keeps yesterday's unanswered asks in it
 * stops being something anyone reads.
 */
export async function getShiftsAwaitingResponse(
  supabase: SupabaseClient,
  profileId: string
): Promise<{ shift: RosterShift; myStatus: ShiftAssignmentStatus | null }[]> {
  // Today where the business is. This used to read the server's date, which on
  // Vercel is UTC — so between midnight and noon in New Zealand it hid the very
  // shifts being asked about that day.
  const from = todayInZone(await getCompanyTimezone(supabase))

  const { data, error } = await supabase
    .from('shifts')
    .select(SHIFT_COLUMNS)
    .gte('local_date', from)
    .order('local_date')
    .order('starts_at')

  assertLoaded(error)

  // RLS has already limited this to departments the person belongs to.
  const shifts = await hydrateShifts(supabase, (data ?? []) as ShiftRow[])

  return shifts
    .map((shift) => ({
      shift,
      myStatus: shift.assigned.find((p) => p.id === profileId)?.status ?? null,
    }))
    .filter(({ shift, myStatus }) => {
      // Already settled either way — nothing left to answer.
      if (myStatus === 'confirmed' || myStatus === 'declined') return false
      // Asked directly, or an open call they have not answered yet.
      if (myStatus === 'invited') return true
      if (myStatus === 'available') return true
      return shift.openToDepartment
    })
}

/** Attaches department names, event names and who is rostered on. */
async function hydrateShifts(
  supabase: SupabaseClient,
  shifts: ShiftRow[]
): Promise<RosterShift[]> {
  if (shifts.length === 0) return []

  const [{ data: assignmentData }, { data: teamsData }] = await Promise.all([
    supabase
      .from('shift_assignments')
      .select('shift_id, profile_id, status')
      .in(
        'shift_id',
        shifts.map((s) => s.id)
      ),
    supabase.from('teams').select('id, name'),
  ])

  const assignments = (assignmentData ?? []) as {
    shift_id: string
    profile_id: string
    status: ShiftAssignmentStatus
  }[]
  const teamName = new Map(
    ((teamsData ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name])
  )

  const assignedIds = [...new Set(assignments.map((a) => a.profile_id))]
  const { data: peopleData } = assignedIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', assignedIds)
    : { data: [] }

  const nameById = new Map(
    ((peopleData ?? []) as { id: string; full_name: string | null; email: string }[]).map((p) => [
      p.id,
      p.full_name ?? p.email,
    ])
  )

  const byShift = new Map<string, RosterAssignment[]>()
  for (const assignment of assignments) {
    const list = byShift.get(assignment.shift_id) ?? []
    list.push({
      id: assignment.profile_id,
      name: nameById.get(assignment.profile_id) ?? 'Unknown',
      status: assignment.status,
    })
    byShift.set(assignment.shift_id, list)
  }

  // Event names, for shifts that belong to one. Resolved in two hops rather
  // than a nested embed, for the same reason as everything else here.
  const dayIds = [...new Set(shifts.map((s) => s.event_day_id).filter((id): id is string => Boolean(id)))]

  const { data: dayData } = dayIds.length
    ? await supabase.from('event_days').select('id, event_id').in('id', dayIds)
    : { data: [] }

  const days = (dayData ?? []) as { id: string; event_id: string }[]
  const eventIds = [...new Set(days.map((d) => d.event_id))]

  const { data: eventData } = eventIds.length
    ? await supabase.from('events').select('id, name, venue_id').in('id', eventIds)
    : { data: [] }

  const events = (eventData ?? []) as { id: string; name: string; venue_id: string | null }[]

  const eventNameById = new Map(events.map((e) => [e.id, e.name]))
  const eventNameByDay = new Map(
    days.map((d) => [d.id, eventNameById.get(d.event_id) ?? null] as const)
  )

  // Which venue each shift is at: its own, else its event's. Same inheritance
  // the geofence uses — a shift without a venue of its own is at the event's.
  const eventVenueById = new Map(events.map((e) => [e.id, e.venue_id]))
  const eventVenueByDay = new Map(
    days.map((d) => [d.id, eventVenueById.get(d.event_id) ?? null] as const)
  )
  const venueIdFor = (shift: ShiftRow) =>
    shift.venue_id ?? (shift.event_day_id ? (eventVenueByDay.get(shift.event_day_id) ?? null) : null)

  /*
   * Zones, resolved once for the whole batch rather than per shift.
   *
   * Only venues that actually override the company's zone matter, and almost
   * none do — one country, one answer. The query is skipped entirely when no
   * shift in the batch is attached to a venue.
   */
  const companyZone = await getCompanyTimezone(supabase)
  const venueIds = [...new Set(shifts.map(venueIdFor).filter((id): id is string => Boolean(id)))]

  const { data: venueData } = venueIds.length
    ? await supabase.from('venues').select('id, timezone').in('id', venueIds)
    : { data: [] }

  const venueZone = new Map(
    ((venueData ?? []) as { id: string; timezone: string | null }[])
      .filter((v) => v.timezone && isValidTimezone(v.timezone))
      .map((v) => [v.id, v.timezone as string])
  )

  const zoneFor = (shift: ShiftRow) => {
    const venueId = venueIdFor(shift)
    return (venueId && venueZone.get(venueId)) || companyZone
  }

  return shifts.map((shift) => ({
    id: shift.id,
    teamId: shift.team_id,
    teamName: teamName.get(shift.team_id) ?? 'Department',
    eventDayId: shift.event_day_id,
    eventName: shift.event_day_id ? (eventNameByDay.get(shift.event_day_id) ?? null) : null,
    title: shift.title,
    startsAt: shift.starts_at,
    endsAt: shift.ends_at,
    localDate: shift.local_date,
    zone: zoneFor(shift),
    positionsNeeded: shift.positions_needed,
    openToDepartment: shift.open_to_department,
    notes: shift.notes,
    // Confirmed first, then those who offered, then unanswered, then declines —
    // which is the order a manager filling the shift actually reads them in.
    assigned: (byShift.get(shift.id) ?? []).sort(
      (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name)
    ),
  }))
}

const STATUS_ORDER: Record<ShiftAssignmentStatus, number> = {
  confirmed: 0,
  available: 1,
  invited: 2,
  declined: 3,
}
