import { Button, Field, Input, Select } from '@/components/ui'
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
  returnTo,
}: {
  eventDayId: string | null
  dayDate: string
  departments: { id: string; name: string }[]
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

      <ShiftTimeFields
        idPrefix={idPrefix}
        defaultStart={`${dayDate}T09:00`}
        defaultEnd={`${dayDate}T17:00`}
      />

      <Button type="submit">Add shift</Button>
    </form>
  )
}
