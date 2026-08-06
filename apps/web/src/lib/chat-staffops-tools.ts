import type Anthropic from '@anthropic-ai/sdk'
import type { createClient } from '@/lib/supabase/server'
import type { Profile } from '@trade-assist/db'
import { EVENT_DAY_TYPES } from '@trade-assist/db'
import { isCompanyAccount } from '@/lib/roles'
import { resolveShiftTimezone } from '@/lib/company'
import { getShiftsInDateRange } from '@/lib/roster'
import { formatInZone, wallClockToInstant } from '@/lib/timezone'
import { addDaysToYmd } from '@/lib/dates'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export type ChatClock = {
  /**
   * The company's IANA zone. Resolved on the server from the company record —
   * it used to be an offset the browser sent, which meant the assistant read
   * "Friday 6pm" as the device's Friday 6pm rather than the venue's.
   */
  zone: string
  /** Today where the business is, so "tomorrow" means the venue's tomorrow. */
  localDate: string
}

/**
 * StaffOps tools for the assistant.
 *
 * Kept apart from the BusinessOps tools because they are only offered to
 * companies with the events module available — a trades business should not be
 * paying tokens for tool definitions describing departments it does not have,
 * and should not be told the assistant can roster.
 *
 * Every tool runs on the caller's own Supabase client, so RLS decides what is
 * possible. A staff member asking the assistant to create a shift gets the same
 * refusal the database would give them; the assistant has no privileges of its
 * own.
 */
export const STAFFOPS_TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_departments',
    description:
      'List the departments (teams) in this company, with who is in each. Call this before creating a shift or rostering anyone, so you use real department names and real people.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_roster',
    description:
      'List shifts between two dates, with who is on each and how many people are still needed.',
    input_schema: {
      type: 'object',
      properties: {
        from_date: { type: 'string', description: 'YYYY-MM-DD' },
        to_date: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['from_date', 'to_date'],
    },
  },
  {
    name: 'create_event',
    description:
      'Create an event with its days. Use day_type pack_in for load-in, event for show days, pack_out for load-out.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        venue_name: {
          type: 'string',
          description: 'Optional. Must match an existing venue name; ignored if it does not.',
        },
        notes: { type: 'string' },
        days: {
          type: 'array',
          description: 'The days this event runs over.',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'YYYY-MM-DD' },
              day_type: { type: 'string', enum: [...EVENT_DAY_TYPES] },
            },
            required: ['date', 'day_type'],
          },
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'create_shift',
    description:
      'Create a shift for a department on a given date. Attach it to an event by naming the event, or leave the event out for dark-day work. Times are the local times the user said.',
    input_schema: {
      type: 'object',
      properties: {
        department: { type: 'string', description: 'Department name, e.g. Operations.' },
        date: { type: 'string', description: 'YYYY-MM-DD, the day the shift starts.' },
        start_time: { type: 'string', description: 'HH:MM, 24-hour.' },
        end_time: {
          type: 'string',
          description: 'HH:MM, 24-hour. If earlier than start_time it is treated as the next day.',
        },
        title: { type: 'string', description: 'The role, e.g. Bar, Stage crew.' },
        people_needed: { type: 'integer', description: 'Defaults to 1.' },
        open_to_department: {
          type: 'boolean',
          description:
            'True to let anyone in the department offer their availability, rather than the manager asking specific people.',
        },
        event_name: { type: 'string', description: 'Optional. Attaches the shift to that event.' },
      },
      required: ['department', 'date', 'start_time', 'end_time'],
    },
  },
  {
    name: 'roster_staff',
    description:
      'Ask named people to work a shift. They are asked, not confirmed — they accept or decline, and a manager confirms who works it.',
    input_schema: {
      type: 'object',
      properties: {
        shift_id: { type: 'string', description: 'From get_roster or create_shift.' },
        names: {
          type: 'array',
          description: 'Names as shown by list_departments.',
          items: { type: 'string' },
        },
      },
      required: ['shift_id', 'names'],
    },
  },
]

/**
 * An instant back into the venue's wall clock, as HH:MM.
 *
 * Tools must never hand the model a raw UTC timestamp. Given `04:00Z` for a 4pm
 * Auckland shift it will say "4am" — which it did, in a reply confirming who had
 * been rostered onto it.
 */
function toLocalHHMM(iso: string, zone: string): string {
  return formatInZone(iso, zone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
}

function nameOf(person: { full_name: string | null; email: string }): string {
  return person.full_name ?? person.email
}

/**
 * A refusal the model cannot skim past.
 *
 * Returning `{ error: "..." }` was not enough: asked to create a shift for a
 * department she does not manage, the assistant received exactly that and still
 * replied "Done. Bar shift created." An assistant that reports rostering which
 * did not happen is worse than one that cannot roster at all — someone does not
 * turn up and nobody finds out until the night.
 *
 * So the shape is explicit rather than inferable, and it hands over a finished
 * sentence to relay instead of asking the model to compose one from an error.
 */
function failed(message: string) {
  return JSON.stringify({
    ok: false,
    action_completed: false,
    tell_the_user: message,
  })
}

function succeeded(details: Record<string, unknown>) {
  return JSON.stringify({ ok: true, action_completed: true, ...details })
}

/**
 * No clock is passed in: each tool resolves the zone it needs from the venue or
 * the company, which is the only answer that matches what the shift will be read
 * back as. The agent still keeps a ChatClock for the system prompt's "today".
 */
export async function executeStaffOpsTool(
  supabase: SupabaseClient,
  profile: Profile,
  name: string,
  input: Record<string, unknown>
): Promise<string | null> {
  switch (name) {
    case 'list_departments': {
      const [{ data: teams }, { data: memberships }] = await Promise.all([
        supabase.from('teams').select('id, name').order('name'),
        supabase.from('team_memberships').select('team_id, profile_id, role'),
      ])

      const ids = [...new Set((memberships ?? []).map((m) => m.profile_id as string))]
      const { data: people } = ids.length
        ? await supabase.from('profiles').select('id, full_name, email').in('id', ids)
        : { data: [] }

      const byId = new Map(
        ((people ?? []) as { id: string; full_name: string | null; email: string }[]).map((p) => [
          p.id,
          nameOf(p),
        ])
      )

      // Department names are company-wide but membership is not: RLS only
      // returns the rows for teams the caller belongs to. Without saying so,
      // another department reads as empty — and the assistant will cheerfully
      // report "Catering has nobody in it" about a department with two people.
      const isCompany = isCompanyAccount(profile.role)
      const myTeamIds = new Set(
        (memberships ?? [])
          .filter((m) => m.profile_id === profile.id)
          .map((m) => m.team_id as string)
      )

      return JSON.stringify({
        departments: ((teams ?? []) as { id: string; name: string }[]).map((team) => {
          const canSeeMembers = isCompany || myTeamIds.has(team.id)
          if (!canSeeMembers) {
            return {
              name: team.name,
              members_visible: false,
              note: 'You are not in this department, so its members are not visible to you. Do not say it is empty.',
            }
          }
          return {
            name: team.name,
            members_visible: true,
            members: (memberships ?? [])
              .filter((m) => m.team_id === team.id)
              .map((m) => ({ name: byId.get(m.profile_id as string) ?? 'Unknown', role: m.role })),
          }
        }),
      })
    }

    case 'get_roster': {
      const from = String(input.from_date ?? '')
      const to = String(input.to_date ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return failed('I need both dates as YYYY-MM-DD.')
      }

      // The same loader the roster screen uses, rather than a second query path
      // of its own. It already resolves department names, who is on each shift
      // and — the part that matters here — the zone each shift's times are in.
      const shifts = await getShiftsInDateRange(supabase, from, to)

      return JSON.stringify({
        shifts: shifts.slice(0, 100).map((shift) => {
          const confirmed = shift.assigned.filter((p) => p.status === 'confirmed')
          return {
            shift_id: shift.id,
            title: shift.title,
            department: shift.teamName,
            date: shift.localDate,
            // Local wall-clock only. The raw instants are deliberately not
            // included: given one, the model reports it as the time of day.
            start_time: toLocalHHMM(shift.startsAt, shift.zone),
            end_time: toLocalHHMM(shift.endsAt, shift.zone),
            needed: shift.positionsNeeded,
            confirmed: confirmed.map((p) => p.name),
            available: shift.assigned.filter((p) => p.status === 'available').map((p) => p.name),
            still_needed: Math.max(0, shift.positionsNeeded - confirmed.length),
            open_to_department: shift.openToDepartment,
          }
        }),
      })
    }

    case 'create_event': {
      const eventName = String(input.name ?? '').trim()
      if (!eventName) return failed('That event was NOT created — it needs a name.')

      let venueId: string | null = null
      const venueName = String(input.venue_name ?? '').trim()
      if (venueName) {
        const { data: venue } = await supabase
          .from('venues')
          .select('id')
          .ilike('name', venueName)
          .maybeSingle()
        venueId = (venue?.id as string) ?? null
      }

      const { data: created, error } = await supabase
        .from('events')
        .insert({
          company_id: profile.company_id,
          name: eventName,
          venue_id: venueId,
          notes: String(input.notes ?? '').trim() || null,
        })
        .select('id')
        .single()

      if (error) {
        return failed(
          error.code === '42501'
            ? 'That event was NOT created — you need to manage a department to create events.'
            : `That event was NOT created: ${error.message}`
        )
      }

      const days = Array.isArray(input.days) ? input.days : []
      const rows = days
        .map((day) => day as { date?: string; day_type?: string })
        .filter((day) => day.date && /^\d{4}-\d{2}-\d{2}$/.test(day.date))
        .map((day) => ({
          event_id: created.id,
          company_id: profile.company_id,
          day_date: day.date!,
          day_type: (EVENT_DAY_TYPES as readonly string[]).includes(day.day_type ?? '')
            ? day.day_type!
            : 'event',
        }))

      if (rows.length > 0) await supabase.from('event_days').insert(rows)

      return succeeded({
        event: eventName,
        venue_matched: venueName ? venueId !== null : undefined,
        days: rows.map((r) => `${r.day_date} ${r.day_type}`),
      })
    }

    case 'create_shift': {
      const departmentName = String(input.department ?? '').trim()
      const { data: team } = await supabase
        .from('teams')
        .select('id, name')
        .ilike('name', departmentName)
        .maybeSingle()

      if (!team) {
        return failed(
          `That shift was NOT created — there is no department called "${departmentName}". Check list_departments for the real names.`
        )
      }

      const date = String(input.date ?? '')

      // Resolved before the times, because which event day a shift lands on
      // decides which venue it is at, and the venue decides the zone.
      let eventDayId: string | null = null
      const eventName = String(input.event_name ?? '').trim()
      if (eventName) {
        const { data: event } = await supabase
          .from('events')
          .select('id')
          .ilike('name', eventName)
          .maybeSingle()

        if (event) {
          const { data: day } = await supabase
            .from('event_days')
            .select('id')
            .eq('event_id', event.id)
            .eq('day_date', date)
            .maybeSingle()
          eventDayId = (day?.id as string) ?? null
        }
      }

      // Through the same helper the roster form uses, so a shift the assistant
      // creates and one a manager types are read back identically.
      const zone = await resolveShiftTimezone(supabase, { venueId: null, eventDayId })

      const startsAt = wallClockToInstant(zone, date, String(input.start_time ?? ''))
      let endsAt = wallClockToInstant(zone, date, String(input.end_time ?? ''))

      if (!startsAt || !endsAt) {
        return failed('That shift was NOT created — I need a date, a start time and a finish time.')
      }

      // A finish earlier than the start means the shift runs past midnight,
      // which is a pack-out rather than a mistake. Resolved as the same wall
      // clock on the next day rather than by adding 24 hours, which would be an
      // hour out on the two nights a year the clocks change.
      if (new Date(endsAt) <= new Date(startsAt)) {
        endsAt =
          wallClockToInstant(zone, addDaysToYmd(date, 1), String(input.end_time ?? '')) ?? endsAt
      }

      const needed = Number(input.people_needed ?? 1)

      const { data: shift, error } = await supabase
        .from('shifts')
        .insert({
          company_id: profile.company_id,
          team_id: team.id,
          event_day_id: eventDayId,
          title: String(input.title ?? '').trim() || null,
          starts_at: startsAt,
          ends_at: endsAt,
          local_date: date,
          positions_needed: Number.isFinite(needed) && needed > 0 ? Math.floor(needed) : 1,
          open_to_department: input.open_to_department === true,
        })
        .select('id')
        .single()

      if (error) {
        return failed(
          error.code === '42501'
            ? `That shift was NOT created — you can only create shifts for a department you manage, and you do not manage ${team.name}.`
            : `That shift was NOT created: ${error.message}`
        )
      }

      return succeeded({
        shift_id: shift.id,
        department: team.name,
        date,
        attached_to_event: eventName ? eventDayId !== null : undefined,
      })
    }

    case 'roster_staff': {
      const shiftId = String(input.shift_id ?? '').trim()
      const names = Array.isArray(input.names) ? input.names.map(String) : []
      if (!shiftId || names.length === 0) {
        return failed('Nobody was asked — I need a shift and at least one name.')
      }

      const { data: shift } = await supabase
        .from('shifts')
        .select('id, team_id')
        .eq('id', shiftId)
        .maybeSingle()

      if (!shift) return failed('Nobody was asked — that shift does not exist, or you cannot see it.')

      const { data: memberships } = await supabase
        .from('team_memberships')
        .select('profile_id')
        .eq('team_id', shift.team_id)

      const memberIds = (memberships ?? []).map((m) => m.profile_id as string)
      const { data: people } = memberIds.length
        ? await supabase.from('profiles').select('id, full_name, email').in('id', memberIds)
        : { data: [] }

      const roster = (people ?? []) as { id: string; full_name: string | null; email: string }[]

      const matched: { id: string; name: string }[] = []
      const unmatched: string[] = []

      for (const wanted of names) {
        const hit = roster.find((p) => nameOf(p).toLowerCase() === wanted.trim().toLowerCase())
        if (hit) matched.push({ id: hit.id, name: nameOf(hit) })
        else unmatched.push(wanted)
      }

      if (matched.length === 0) {
        return failed(
          `Nobody was asked — none of those names are in that department. Its members are: ${roster.map(nameOf).join(', ') || 'nobody'}.`
        )
      }

      const { error } = await supabase.from('shift_assignments').upsert(
        matched.map((person) => ({ shift_id: shiftId, profile_id: person.id, status: 'invited' })),
        { onConflict: 'shift_id,profile_id', ignoreDuplicates: true }
      )

      if (error) {
        return failed(
          error.code === '42501'
            ? 'Nobody was asked — you can only roster onto a department you manage.'
            : `Nobody was asked: ${error.message}`
        )
      }

      return succeeded({
        asked: matched.map((p) => p.name),
        not_in_department: unmatched,
        note: 'They have been asked, not confirmed. They accept or decline, then a manager confirms.',
      })
    }

    default:
      return null
  }
}
