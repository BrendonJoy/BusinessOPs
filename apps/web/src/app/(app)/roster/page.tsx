import { createClient } from '@/lib/supabase/server'
import { requireEventsModule } from '@/lib/events'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'
import { getRosterContext, getShiftsAwaitingResponse, getShiftsInDateRange } from '@/lib/roster'
import { LocalTimeRange } from '@/components/LocalTime'
import { respondToShift } from './actions'
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

  const awaiting = profile ? await getShiftsAwaitingResponse(supabase, profile.id) : []

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

      {/* Top of the page on purpose. This is the one thing on this screen that
          is waiting on the person reading it, and it is the whole point of the
          screen for anyone who is not a manager. */}
      {awaiting.length > 0 && (
        <section className={cardClasses('mb-6 border-accent/40')}>
          <h2 className="mb-1 text-sm font-medium">Can you work these?</h2>
          <p className="mb-3 text-sm text-muted">
            Saying you&apos;re available doesn&apos;t put you on the shift — your manager confirms
            who works it.
          </p>

          <ul className="flex flex-col gap-2">
            {awaiting.map(({ shift, myStatus }) => (
              <li
                key={shift.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-surface-border px-3 py-2"
              >
                <div className="text-sm">
                  <p className="font-medium">
                    {shift.title ?? shift.teamName}
                    {shift.eventName && <span className="ml-2 text-muted">{shift.eventName}</span>}
                  </p>
                  <p className="text-muted">
                    {formatDayLabel(shift.localDate)}{' '}
                    <LocalTimeRange start={shift.startsAt} end={shift.endsAt} />
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {myStatus === 'available' && (
                    <span className="text-xs text-muted">You said yes — awaiting confirmation</span>
                  )}
                  <form action={respondToShift.bind(null, returnTo, shift.id, true)}>
                    <Button type="submit" variant={myStatus === 'available' ? 'secondary' : 'primary'} size="sm">
                      {myStatus === 'available' ? 'Still available' : "I'm available"}
                    </Button>
                  </form>
                  <form action={respondToShift.bind(null, returnTo, shift.id, false)}>
                    <Button type="submit" size="sm">
                      Can&apos;t work it
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
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
