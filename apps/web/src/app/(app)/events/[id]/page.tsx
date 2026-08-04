import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireEventsModule } from '@/lib/events'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'
import { formatDate, formatDayLabel } from '@/lib/dates'
import {
  EVENT_DAY_TYPES,
  EVENT_DAY_TYPE_LABELS,
  type EventDay,
  type EventRecord,
} from '@trade-assist/db'
import { Button, Field, Input, Notice, PageHeader, Select, Textarea, cardClasses } from '@/components/ui'
import ConfirmSubmitButton from '@/components/ConfirmSubmitButton'
import { getRosterContext, getShiftsForEventDays } from '@/lib/roster'
import ShiftCard from '../../roster/ShiftCard'
import AddShiftForm from '../../roster/AddShiftForm'
import { addEventDay, deleteEvent, removeEventDay, updateEvent } from '../actions'

const DAY_TYPE_STYLE: Record<string, string> = {
  pack_in: 'border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300',
  event: 'border-emerald-500/50 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  pack_out: 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300',
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams
  const supabase = await createClient()
  await requireEventsModule(supabase)

  const profile = await getCurrentProfile(supabase)

  const { data: eventData } = await supabase.from('events').select('*').eq('id', id).maybeSingle()
  if (!eventData) notFound()
  const event = eventData as EventRecord

  const { data: daysData } = await supabase
    .from('event_days')
    .select('*')
    .eq('event_id', id)
    .order('day_date')
  const days = (daysData ?? []) as EventDay[]

  const { count: managedCount } = await supabase
    .from('team_memberships')
    .select('team_id', { count: 'exact', head: true })
    .eq('profile_id', profile?.id ?? '')
    .eq('role', 'manager')

  const canEdit = isCompanyAccount(profile?.role) || (managedCount ?? 0) > 0

  const roster = await getRosterContext(supabase)
  const shifts = await getShiftsForEventDays(
    supabase,
    days.map((day) => day.id)
  )

  const shiftsByDay = new Map<string, typeof shifts>()
  for (const shift of shifts) {
    if (!shift.eventDayId) continue
    const list = shiftsByDay.get(shift.eventDayId) ?? []
    list.push(shift)
    shiftsByDay.set(shift.eventDayId, list)
  }

  const returnTo = `/events/${event.id}`

  return (
    <div>
      <Link href="/events" className="mb-4 inline-block text-sm font-medium text-accent">
        ← Back to events
      </Link>

      <PageHeader
        title={event.name}
        description={event.venue ?? undefined}
      />

      {error && (
        <Notice tone="error" className="mb-4">
          {error}
        </Notice>
      )}

      <section className={cardClasses('mb-4')}>
        <h2 className="mb-3 text-sm font-medium">Days</h2>

        {days.length === 0 ? (
          <p className="text-sm text-muted">
            No days yet. Add the pack-in, the show days and the pack-out below — shifts are rostered
            onto a day.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {days.map((day) => {
              const dayShifts = shiftsByDay.get(day.id) ?? []

              return (
                <li key={day.id} className="rounded-md border border-surface-border px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-3">
                      <span
                        className={`rounded border px-1.5 py-0.5 text-xs font-medium ${DAY_TYPE_STYLE[day.day_type]}`}
                      >
                        {EVENT_DAY_TYPE_LABELS[day.day_type]}
                      </span>
                      <span className="text-sm">
                        {formatDayLabel(day.day_date)}
                        <span className="ml-2 text-muted">{formatDate(day.day_date)}</span>
                      </span>
                    </span>

                    {canEdit && (
                      <ConfirmSubmitButton
                        action={removeEventDay.bind(null, event.id, day.id)}
                        confirmMessage={`Remove ${EVENT_DAY_TYPE_LABELS[day.day_type]} on ${formatDate(day.day_date)} from this event?`}
                        className="text-xs text-muted hover:text-accent"
                      >
                        Remove
                      </ConfirmSubmitButton>
                    )}
                  </div>

                  {dayShifts.length > 0 && (
                    <div className="mt-3 flex flex-col gap-2">
                      {dayShifts.map((shift) => (
                        <ShiftCard
                          key={shift.id}
                          shift={shift}
                          members={roster.membersByTeam.get(shift.teamId) ?? []}
                          canManage={roster.canManage(shift.teamId)}
                          returnTo={returnTo}
                        />
                      ))}
                    </div>
                  )}

                  {canEdit && (
                    <AddShiftForm
                      eventDayId={day.id}
                      dayDate={day.day_date}
                      departments={roster.manageable}
                      returnTo={returnTo}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {canEdit && (
          <form
            action={addEventDay.bind(null, event.id)}
            className="mt-4 flex flex-wrap items-end gap-3 border-t border-surface-border pt-4"
          >
            <Field label="Date" htmlFor="day_date" className="min-w-[150px] flex-1">
              <Input id="day_date" name="day_date" type="date" required />
            </Field>
            <Field label="Type" htmlFor="day_type">
              <Select id="day_type" name="day_type" defaultValue="event" fullWidth={false} className="sm:w-40">
                {EVENT_DAY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {EVENT_DAY_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit">Add day</Button>
          </form>
        )}
      </section>

      {canEdit && (
        <section className={cardClasses()}>
          <h2 className="mb-3 text-sm font-medium">Event details</h2>
          <form action={updateEvent.bind(null, event.id)} className="flex flex-col gap-4">
            <Field label="Event name" htmlFor="name">
              <Input id="name" name="name" type="text" required defaultValue={event.name} />
            </Field>
            <Field label="Venue" htmlFor="venue">
              <Input id="venue" name="venue" type="text" defaultValue={event.venue ?? ''} />
            </Field>
            <Field label="Notes" htmlFor="notes">
              <Textarea id="notes" name="notes" rows={3} defaultValue={event.notes ?? ''} />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="submit" variant="primary">
                Save event
              </Button>
              <ConfirmSubmitButton
                action={deleteEvent.bind(null, event.id)}
                confirmMessage={`Delete ${event.name}? This removes the event and all of its days.`}
                className="text-xs text-muted hover:text-accent"
              >
                Delete event
              </ConfirmSubmitButton>
            </div>
          </form>
        </section>
      )}
    </div>
  )
}
