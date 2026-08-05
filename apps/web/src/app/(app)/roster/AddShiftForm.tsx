import { Button, Field, Input, Select, checkboxClasses } from '@/components/ui'
import type { Venue } from '@trade-assist/db'
import ShiftTimeFields from './ShiftTimeFields'
import { createShift } from './actions'

/**
 * `dayDate` seeds the pickers with that day's date so a manager rostering a
 * show day is not retyping it for every shift. It is only a default — a
 * pack-out finishing after midnight is expected to move the finish date.
 */
export default function AddShiftForm({
  eventDayId,
  dayDate,
  departments,
  venues = [],
  returnTo,
}: {
  eventDayId: string | null
  dayDate: string
  departments: { id: string; name: string }[]
  /** Only offered for dark-day shifts; event shifts inherit the event's venue. */
  venues?: Venue[]
  returnTo: string
}) {
  if (departments.length === 0) {
    return (
      <p className="mt-3 border-t border-surface-border pt-3 text-xs text-muted">
        You don&apos;t manage a department yet, so there is nowhere to put a shift. The company
        account sets these up in Settings.
      </p>
    )
  }

  const idPrefix = eventDayId ?? 'standalone'

  return (
    <form
      action={createShift.bind(null, returnTo)}
      className="mt-3 flex flex-wrap items-end gap-3 border-t border-surface-border pt-3"
    >
      {eventDayId && <input type="hidden" name="event_day_id" value={eventDayId} />}

      <Field label="Department" htmlFor={`team-${idPrefix}`}>
        <Select id={`team-${idPrefix}`} name="team_id" fullWidth={false} className="sm:w-40">
          {departments.map((dept) => (
            <option key={dept.id} value={dept.id}>
              {dept.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Role" htmlFor={`title-${idPrefix}`} hint="Optional.">
        <Input id={`title-${idPrefix}`} name="title" type="text" placeholder="Bar" className="sm:w-36" />
      </Field>

      <Field label="People needed" htmlFor={`needed-${idPrefix}`}>
        <Input
          id={`needed-${idPrefix}`}
          name="positions_needed"
          type="number"
          min="1"
          step="1"
          defaultValue={1}
          className="sm:w-24"
        />
      </Field>

      {!eventDayId && venues.length > 0 && (
        <Field label="Venue" htmlFor={`venue-${idPrefix}`} hint="For geofencing.">
          <Select id={`venue-${idPrefix}`} name="venue_id" fullWidth={false} className="sm:w-40">
            <option value="">No venue</option>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
                {venue.geo_lat === null ? ' (not located)' : ''}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <ShiftTimeFields
        idPrefix={idPrefix}
        defaultStart={`${dayDate}T09:00`}
        defaultEnd={`${dayDate}T17:00`}
      />

      {/* An open call is how a shift needing ten gets filled from a pool of
          thirty — everyone in the department sees it and can offer, and the
          manager confirms who actually works it. */}
      <label className="flex items-center gap-1.5 self-end pb-2 text-xs">
        <input type="checkbox" name="open_to_department" className={checkboxClasses()} />
        Open to the whole department
      </label>

      <Button type="submit">Add shift</Button>
    </form>
  )
}
