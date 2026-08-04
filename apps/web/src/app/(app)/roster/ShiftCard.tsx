import { LocalTimeRange } from '@/components/LocalTime'
import ConfirmSubmitButton from '@/components/ConfirmSubmitButton'
import { Button, Select } from '@/components/ui'
import type { RosterPerson, RosterShift } from '@/lib/roster'
import { assignToShift, deleteShift, unassignFromShift } from './actions'

/**
 * One shift and who is on it.
 *
 * Only people in the shift's own department can be rostered onto it, so the
 * picker is drawn from that department's membership rather than the whole
 * company — the database refuses cross-department rostering anyway, and
 * offering names that will be rejected is a trap rather than a feature.
 */
export default function ShiftCard({
  shift,
  members,
  canManage,
  returnTo,
}: {
  shift: RosterShift
  members: RosterPerson[]
  canManage: boolean
  returnTo: string
}) {
  const assignedIds = new Set(shift.assigned.map((p) => p.id))
  const available = members.filter((m) => !assignedIds.has(m.id))

  return (
    <div className="rounded-md border border-surface-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            {shift.title || shift.teamName}
            {shift.title && <span className="ml-2 text-xs text-muted">{shift.teamName}</span>}
          </p>
          <p className="text-sm text-muted">
            <LocalTimeRange start={shift.startsAt} end={shift.endsAt} />
          </p>
          {shift.notes && <p className="mt-1 text-xs text-muted">{shift.notes}</p>}
        </div>

        {canManage && (
          <ConfirmSubmitButton
            action={deleteShift.bind(null, returnTo, shift.id)}
            confirmMessage={`Delete this shift? ${
              shift.assigned.length > 0
                ? `${shift.assigned.length} person${shift.assigned.length === 1 ? '' : 's'} rostered on will lose it.`
                : ''
            }`}
            className="text-xs text-muted hover:text-accent"
          >
            Delete
          </ConfirmSubmitButton>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {shift.assigned.length === 0 ? (
          <span className="text-xs text-muted">Nobody rostered yet</span>
        ) : (
          shift.assigned.map((person) => (
            <span
              key={person.id}
              className="inline-flex items-center gap-1 rounded-full border border-surface-border bg-surface px-2 py-0.5 text-xs"
            >
              {person.name}
              {canManage && (
                <ConfirmSubmitButton
                  action={unassignFromShift.bind(null, returnTo, shift.id, person.id)}
                  confirmMessage={`Take ${person.name} off this shift?`}
                  className="text-muted hover:text-accent"
                >
                  ×
                </ConfirmSubmitButton>
              )}
            </span>
          ))
        )}
      </div>

      {canManage && available.length > 0 && (
        <form
          action={assignToShift.bind(null, returnTo, shift.id)}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <Select
            name="profile_id"
            aria-label="Add someone to this shift"
            fullWidth={false}
            size="sm"
            className="w-48"
          >
            {available.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm">
            Roster on
          </Button>
        </form>
      )}

      {canManage && members.length === 0 && (
        <p className="mt-3 text-xs text-muted">
          Nobody is in {shift.teamName} yet — add people to the department in Settings before
          rostering.
        </p>
      )}
    </div>
  )
}
