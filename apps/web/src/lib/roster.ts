import type { createClient } from '@/lib/supabase/server'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export type RosterPerson = { id: string; name: string }

export type RosterShift = {
  id: string
  teamId: string
  teamName: string
  eventDayId: string | null
  title: string | null
  startsAt: string
  endsAt: string
  notes: string | null
  assigned: RosterPerson[]
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

  const { data: shiftData } = await supabase
    .from('shifts')
    .select('id, team_id, event_day_id, title, starts_at, ends_at, notes')
    .in('event_day_id', eventDayIds)
    .order('starts_at')

  const shifts = (shiftData ?? []) as {
    id: string
    team_id: string
    event_day_id: string | null
    title: string | null
    starts_at: string
    ends_at: string
    notes: string | null
  }[]

  if (shifts.length === 0) return []

  const [{ data: assignmentData }, { data: teamsData }] = await Promise.all([
    supabase
      .from('shift_assignments')
      .select('shift_id, profile_id')
      .in(
        'shift_id',
        shifts.map((s) => s.id)
      ),
    supabase.from('teams').select('id, name'),
  ])

  const assignments = (assignmentData ?? []) as { shift_id: string; profile_id: string }[]
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

  const byShift = new Map<string, RosterPerson[]>()
  for (const assignment of assignments) {
    const list = byShift.get(assignment.shift_id) ?? []
    list.push({ id: assignment.profile_id, name: nameById.get(assignment.profile_id) ?? 'Unknown' })
    byShift.set(assignment.shift_id, list)
  }

  return shifts.map((shift) => ({
    id: shift.id,
    teamId: shift.team_id,
    teamName: teamName.get(shift.team_id) ?? 'Department',
    eventDayId: shift.event_day_id,
    title: shift.title,
    startsAt: shift.starts_at,
    endsAt: shift.ends_at,
    notes: shift.notes,
    assigned: (byShift.get(shift.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  }))
}
