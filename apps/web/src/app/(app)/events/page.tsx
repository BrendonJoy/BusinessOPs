import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireEventsModule } from '@/lib/events'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'
import { formatDate } from '@/lib/dates'
import { EVENT_DAY_TYPE_LABELS, type EventDay, type EventRecord } from '@trade-assist/db'
import { Button, EmptyState, Notice, PageHeader, buttonClasses, cardClasses } from '@/components/ui'

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const supabase = await createClient()
  await requireEventsModule(supabase)

  const profile = await getCurrentProfile(supabase)

  // Managers create events as well as the company account, so the button shows
  // for anyone who manages a department.
  const { count: managedCount } = await supabase
    .from('team_memberships')
    .select('team_id', { count: 'exact', head: true })
    .eq('profile_id', profile?.id ?? '')
    .eq('role', 'manager')

  const canCreate = isCompanyAccount(profile?.role) || (managedCount ?? 0) > 0

  const [{ data: eventsData }, { data: daysData }, { data: venuesData }] = await Promise.all([
    supabase.from('events').select('*').order('created_at', { ascending: false }),
    supabase.from('event_days').select('*').order('day_date'),
    supabase.from('venues').select('id, name'),
  ])

  const events = (eventsData ?? []) as EventRecord[]
  const days = (daysData ?? []) as EventDay[]
  const venueName = new Map(
    ((venuesData ?? []) as { id: string; name: string }[]).map((v) => [v.id, v.name])
  )

  const daysByEvent = new Map<string, EventDay[]>()
  for (const day of days) {
    const list = daysByEvent.get(day.event_id) ?? []
    list.push(day)
    daysByEvent.set(day.event_id, list)
  }

  return (
    <div>
      <PageHeader
        title="Events"
        actions={
          canCreate ? (
            <Link href="/events/new" className={buttonClasses('primary', 'md')}>
              New event
            </Link>
          ) : undefined
        }
      />

      {error && (
        <Notice tone="error" className="mb-4">
          {error}
        </Notice>
      )}

      {events.length === 0 ? (
        <EmptyState
          title="No events yet"
          description={
            canCreate
              ? 'Create one, add its pack-in, show and pack-out days, then roster shifts onto them.'
              : 'Once a manager adds an event you will see it here.'
          }
          action={
            canCreate ? (
              <Link href="/events/new">
                <Button variant="primary">New event</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((event) => {
            const eventDays = daysByEvent.get(event.id) ?? []
            // Days are already sorted by date, so the run is simply the ends.
            const first = eventDays[0]
            const last = eventDays[eventDays.length - 1]
            const counts = eventDays.reduce<Record<string, number>>((acc, d) => {
              acc[d.day_type] = (acc[d.day_type] ?? 0) + 1
              return acc
            }, {})

            return (
              <li key={event.id} className="relative">
                <div className={cardClasses()}>
                  <p className="font-medium">{event.name}</p>
                  {event.venue_id && (
                    <p className="text-sm text-muted">{venueName.get(event.venue_id) ?? 'Venue'}</p>
                  )}

                  <p className="mt-2 text-sm text-muted">
                    {eventDays.length === 0 ? (
                      'No days scheduled yet'
                    ) : (
                      <>
                        {formatDate(first.day_date)}
                        {last.day_date !== first.day_date && <> – {formatDate(last.day_date)}</>}
                      </>
                    )}
                  </p>

                  {eventDays.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                      {Object.entries(counts).map(([type, count]) => (
                        <span key={type}>
                          {count} × {EVENT_DAY_TYPE_LABELS[type as keyof typeof EVENT_DAY_TYPE_LABELS]}
                        </span>
                      ))}
                    </p>
                  )}
                </div>

                {/* Overlay link rather than a wrapper: an anchor around a card
                    that itself contains links is invalid and breaks hydration. */}
                <Link
                  href={`/events/${event.id}`}
                  className="absolute inset-0 rounded-lg active:bg-foreground/5"
                >
                  <span className="sr-only">Open {event.name}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
