import { LocalTimeRange } from '@/components/LocalTime'
import ConfirmSubmitButton from '@/components/ConfirmSubmitButton'
import { Button, checkboxClasses } from '@/components/ui'
import { SHIFT_ASSIGNMENT_STATUS_LABELS, type ShiftAssignmentStatus } from '@trade-assist/db'
import type { RosterPerson, RosterShift } from '@/lib/roster'
import {
  assignToShift,
  deleteShift,
  setAssignmentStatus,
  setShiftOpen,
  unassignFromShift,
} from './actions'

const STATUS_STYLE: Record<ShiftAssignmentStatus, string> = {
  confirmed: 'border-emerald-500/50 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  available: 'border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300',
  invited: 'border-surface-border bg-surface text-muted',
  declined: 'border-rose-500/30 bg-rose-500/10 text-rose-700 line-through dark:text-rose-300',
}

/**
 * One shift, who is on it, and how far off being filled it is.
 *
 * The count that matters is confirmed against needed. People who have offered
 * are shown separately and deliberately do not count towards it — on an open
 * call everybody may put their hand up, and the manager still chooses.
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
  const attachedIds = new Set(shift.assigned.map((p) => p.id))
  const available = members.filter((m) => !attachedIds.has(m.id))

  const confirmed = shift.assigned.filter((p) => p.status === 'confirmed')
  const offered = shift.assigned.filter((p) => p.status === 'available')
  const short = shift.positionsNeeded - confirmed.length

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

        <div className="flex items-center gap-2">
          <span
            className={`rounded border px-1.5 py-0.5 text-xs font-medium ${
              short > 0
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                : 'border-emerald-500/50 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {confirmed.length}/{shift.positionsNeeded} confirmed
          </span>

          {canManage && (
            <ConfirmSubmitButton
              action={deleteShift.bind(null, returnTo, shift.id)}
              confirmMessage={`Delete this shift?${
                shift.assigned.length > 0 ? ` ${shift.assigned.length} people are attached to it.` : ''
              }`}
              className="text-xs text-muted hover:text-accent"
            >
              Delete
            </ConfirmSubmitButton>
          )}
        </div>
      </div>

      {canManage && (
        <form action={setShiftOpen.bind(null, returnTo, shift.id, !shift.openToDepartment)} className="mt-2">
          <button type="submit" className="text-xs text-muted underline hover:text-accent">
            {shift.openToDepartment
              ? 'Open to the whole department — close it'
              : `Only people you ask can see this as available — open it to all ${shift.teamName}`}
          </button>
        </form>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {shift.assigned.length === 0 ? (
          <span className="text-xs text-muted">Nobody asked yet</span>
        ) : (
          shift.assigned.map((person) => (
            <span
              key={person.id}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLE[person.status]}`}
            >
              {person.name}
              <span className="opacity-70">{SHIFT_ASSIGNMENT_STATUS_LABELS[person.status]}</span>

              {canManage && person.status === 'available' && (
                <form action={setAssignmentStatus.bind(null, returnTo, shift.id, person.id, 'confirmed')}>
                  <button type="submit" className="font-medium underline hover:opacity-70">
                    confirm
                  </button>
                </form>
              )}

              {canManage && (
                <ConfirmSubmitButton
                  action={unassignFromShift.bind(null, returnTo, shift.id, person.id)}
                  confirmMessage={`Take ${person.name} off this shift?`}
                  className="opacity-70 hover:opacity-100"
                >
                  ×
                </ConfirmSubmitButton>
              )}
            </span>
          ))
        )}
      </div>

      {canManage && offered.length > 0 && short > 0 && (
        <p className="mt-2 text-xs text-muted">
          {offered.length} {offered.length === 1 ? 'person has' : 'people have'} offered — confirm
          the {short} you want.
        </p>
      )}

      {canManage && available.length > 0 && (
        <form
          action={assignToShift.bind(null, returnTo, shift.id)}
          className="mt-3 border-t border-surface-border pt-3"
        >
          <p className="mb-1.5 text-xs font-medium text-muted">Ask more people</p>
          {/* Checkboxes rather than a dropdown: filling a bar call means picking
              most of a thirty-person pool, and one name per submit was the first
              thing to grate in real use. */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {available.map((person) => (
              <label key={person.id} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  name="profile_id"
                  value={person.id}
                  className={checkboxClasses()}
                />
                {person.name}
              </label>
            ))}
          </div>
          <Button type="submit" size="sm" className="mt-2">
            Ask selected
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
