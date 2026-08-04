import Link from 'next/link'
import { Field, Select } from '@/components/ui'
import type { Venue } from '@trade-assist/db'

/**
 * Picking a venue rather than typing one, so a shift has coordinates to be
 * fenced against. Optional throughout — an event without a venue still works,
 * it just cannot geofence.
 */
export default function VenueSelect({
  venues,
  defaultValue,
  id = 'venue_id',
  label = 'Venue',
  className,
}: {
  venues: Venue[]
  defaultValue?: string | null
  id?: string
  label?: string
  className?: string
}) {
  if (venues.length === 0) {
    return (
      <Field label={label} htmlFor={id} className={className}>
        <p className="text-xs text-muted">
          No venues yet.{' '}
          <Link href="/settings" className="font-medium text-accent">
            Add one in Settings
          </Link>{' '}
          to geofence clock-in.
        </p>
      </Field>
    )
  }

  return (
    <Field label={label} htmlFor={id} className={className}>
      <Select id={id} name="venue_id" defaultValue={defaultValue ?? ''} fullWidth={false} className="sm:w-52">
        <option value="">No venue</option>
        {venues.map((venue) => (
          <option key={venue.id} value={venue.id}>
            {venue.name}
            {venue.geo_lat === null ? ' (not located)' : ''}
          </option>
        ))}
      </Select>
    </Field>
  )
}
