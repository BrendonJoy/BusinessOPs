import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireEventsModule } from '@/lib/events'
import { EVENT_DAY_TYPES, EVENT_DAY_TYPE_LABELS } from '@trade-assist/db'
import { Button, Field, Input, Notice, PageHeader, Select, Textarea } from '@/components/ui'
import { createEvent } from '../actions'

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const supabase = await createClient()
  await requireEventsModule(supabase)

  return (
    <div className="mx-auto w-full max-w-xl">
      <PageHeader title="New event" />

      {error && (
        <Notice tone="error" className="mb-4">
          {error}
        </Notice>
      )}

      <form action={createEvent} className="flex flex-col gap-4">
        <Field label="Event name" htmlFor="name">
          <Input id="name" name="name" type="text" required placeholder="Summer Festival" />
        </Field>

        <Field label="Venue" htmlFor="venue" hint="Optional.">
          <Input id="venue" name="venue" type="text" placeholder="Main Arena" />
        </Field>

        <div className="rounded-lg border border-surface-border p-3">
          <p className="mb-1 text-sm font-medium">First day</p>
          <p className="mb-3 text-xs text-muted">
            Optional, and you can add the rest — pack-in, extra show days, pack-out — once the event
            exists.
          </p>
          <div className="flex flex-wrap gap-3">
            <Field label="Date" htmlFor="first_date" className="min-w-[150px] flex-1">
              <Input id="first_date" name="first_date" type="date" />
            </Field>
            <Field label="Type" htmlFor="first_day_type">
              <Select id="first_day_type" name="first_day_type" defaultValue="pack_in" fullWidth={false} className="sm:w-40">
                {EVENT_DAY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {EVENT_DAY_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>

        <Field label="Notes" htmlFor="notes" hint="Optional.">
          <Textarea id="notes" name="notes" rows={3} />
        </Field>

        <div className="mt-2 flex items-center gap-3">
          <Button type="submit" variant="primary">
            Create event
          </Button>
          <Link href="/events" className="text-sm text-muted">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
