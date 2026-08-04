import { createClient } from '@/lib/supabase/server'
import { requireEventsModule } from '@/lib/events'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'
import { getRosterContext, getShiftsInDateRange } from '@/lib/roster'
import { formatDate, formatDayLabel, toYmd } from '@/lib/dates'
import { Button, EmptyState, Field, Input, Notice, PageHeader, cardClasses } from '@/components/ui'
import type { Venue } from '@trade-assist/db'
import ShiftCard from './ShiftCard'
import AddShiftForm from './AddShiftForm'

/**
 * The roster by date, including "dark day" shifts that belong to no event.
 *
 * The default window starts yesterday rather than today because the server does
 * not know the viewer's date — it only knows UTC. Reaching back a day means
 * nobody west of UTC opens this at 9am and finds their own shift missing. The
 * cost is one extra day of history, which is not a cost.
 */
const DAYS_AHEAD = 14

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; error?: string }>
}) {
  const { date, error } = await searchParams
  const supabase = await createClient()
  await requireEventsModule(supabase)

  const profile = await getCurrentProfile(supabase)

  const isSingleDay = Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date))

  const serverToday = new Date()
  const from = isSingleDay ? date! : toYmd(new Date(serverToday.getTime() - 86_400_000))
  const to = isSingleDay
    ? date!
    : toYmd(new Date(serverToday.getTime() + DAYS_AHEAD * 86_400_000))

  const [roster, shifts, { data: venuesData }] = await Promise.all([
    getRosterContext(supabase),
    getShiftsInDateRange(supabase, from, to),
    supabase.from('venues').select('*').order('name'),
  ])
  const venues = (venuesData ?? []) as Venue[]

  const byDate = new Map<string, typeof shifts>()
  for (const shift of shifts) {
    const list = byDate.get(shift.localDate) ?? []
    list.push(shift)
    byDate.set(shift.localDate, list)
  }
  const dates = [...byDate.keys()].sort()

  const canRoster = isCompanyAccount(profile?.role) || roster.manageable.length > 0
  const returnTo = isSingleDay ? `/roster?date=${date}` : '/roster'

  return (
    <div>
      <PageHeader
        title="Roster"
        description={
          isSingleDay
            ? formatDate(from)
            : 'Everything scheduled over the next couple of weeks, across your departments.'
        }
        actions={
          <form className="flex items-end gap-2">
            <Field label="Jump to a day" htmlFor="date">
              <Input id="date" name="date" type="date" defaultValue={isSingleDay ? date : ''} />
            </Field>
            <Button type="submit">Show</Button>
          </form>
        }
      />

      {error && (
        <Notice tone="error" className="mb-4">
          {error}
        </Notice>
      )}

      {canRoster && (
        <section className={cardClasses('mb-6')}>
          <h2 className="mb-1 text-sm font-medium">Add a shift</h2>
          <p className="mb-1 text-sm text-muted">
            For work that isn&apos;t tied to an event — dark-day maintenance, deep cleans, a
            one-off. Shifts for an event are added on the event itself, against the right day.
          </p>
          <AddShiftForm
            eventDayId={null}
            dayDate={isSingleDay ? date! : toYmd(serverToday)}
            departments={roster.manageable}
            venues={venues}
            returnTo={returnTo}
          />
        </section>
      )}

      {dates.length === 0 ? (
        <EmptyState
          title={isSingleDay ? 'Nothing on this day' : 'Nothing rostered yet'}
          description={
            canRoster
              ? 'Add a shift above, or open an event to roster its pack-in and show days.'
              : 'Shifts you are put on will appear here.'
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {dates.map((day) => (
            <section key={day}>
              <h2 className="mb-2 text-sm font-medium">
                {formatDayLabel(day)}
                <span className="ml-2 text-muted">{formatDate(day)}</span>
              </h2>

              <div className="flex flex-col gap-2">
                {(byDate.get(day) ?? []).map((shift) => (
                  <div key={shift.id}>
                    {shift.eventName && (
                      <p className="mb-1 text-xs text-muted">{shift.eventName}</p>
                    )}
                    <ShiftCard
                      shift={shift}
                      members={roster.membersByTeam.get(shift.teamId) ?? []}
                      canManage={roster.canManage(shift.teamId)}
                      returnTo={returnTo}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
