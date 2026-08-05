'use client'

import { useEffect, useState } from 'react'
import { TIMESHEET_MISC_CATEGORIES, TIMESHEET_MISC_CATEGORY_LABELS } from '@trade-assist/db'
import { Button, Card, Field, Input, Select, cardClasses } from '@/components/ui'

type JobOption = { id: string; job_number: string | null; customerName: string | null }

export type ShiftOption = {
  id: string
  title: string | null
  teamName: string
  eventName: string | null
  startsAt: string
  endsAt: string
}

/**
 * "Bar · Winter Gala · 18:00–02:00". Built in the browser so the times are in
 * the viewer's zone rather than the server's — the same reason LocalTime
 * exists. Someone picking a shift at 5:55am needs the label to match the clock
 * on the wall.
 */
function shiftLabel(shift: ShiftOption): string {
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', hour12: false })

  const parts = [shift.title || shift.teamName]
  if (shift.eventName) parts.push(shift.eventName)
  parts.push(`${time(shift.startsAt)}–${time(shift.endsAt)}`)
  return parts.join(' · ')
}

function nowHHMM(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

function minutesAgoHHMM(minutes: number): string {
  const d = new Date(Date.now() - minutes * 60 * 1000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function minutesAheadHHMM(minutes: number): string {
  const d = new Date(Date.now() + minutes * 60 * 1000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function ClockWidget({
  openEntry,
  jobs,
  shifts = [],
  geofenceEnabled,
  clockInAction,
  clockOutAction,
}: {
  openEntry: {
    id: string
    label: string
    clockInTime: string
  } | null
  jobs: JobOption[]
  shifts?: ShiftOption[]
  geofenceEnabled: boolean
  clockInAction: (formData: FormData) => void
  clockOutAction: (formData: FormData) => void
}) {
  // Rostered shifts win the default. Someone opening this at a venue is almost
  // always about to start the shift they were put on, and making that the first
  // option saves the one interaction that matters when you are already late.
  const [target, setTarget] = useState(
    shifts.length > 0
      ? `shift:${shifts[0].id}`
      : jobs.length > 0
        ? `job:${jobs[0].id}`
        : `misc:${TIMESHEET_MISC_CATEGORIES[0]}`
  )
  // Held as "has the person typed a time themselves?" rather than as a value,
  // because an untouched field has to mean *now* on every render, not the
  // moment the widget mounted.
  //
  // It used to hold the mount-time value while `min`/`max` were recomputed on
  // each render. One minute later `min` had moved past the stale value, the
  // browser marked the field rangeUnderflow, and `Clock out` silently stopped
  // submitting — a dead button with no message, on the one interaction someone
  // performs while wanting to go home.
  const [startTime, setStartTime] = useState<string | null>(null)
  const [finishTime, setFinishTime] = useState<string | null>(null)
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)

  useEffect(() => {
    if (!geofenceEnabled || !('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude)
        setLng(position.coords.longitude)
      },
      () => setLocationError('Could not access your location. Enable location access to clock in/out.')
    )
  }, [geofenceEnabled])

  const [kind, value] = [target.slice(0, target.indexOf(':')), target.slice(target.indexOf(':') + 1)]
  const jobId = kind === 'job' ? value : ''
  const shiftId = kind === 'shift' ? value : ''
  const miscCategory = kind === 'misc' ? value : ''

  if (openEntry) {
    return (
      <Card>
        <p className="text-sm">
          Clocked in to <span className="font-medium">{openEntry.label}</span> since{' '}
          <span className="font-medium">{openEntry.clockInTime}</span>
        </p>
        <form action={clockOutAction} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <input type="hidden" name="lat" value={lat ?? ''} />
          <input type="hidden" name="lng" value={lng ?? ''} />
          <Field label="Finish time" htmlFor="finish_time">
            <Input
              id="finish_time"
              name="finish_time"
              type="time"
              value={finishTime ?? nowHHMM()}
              min={minutesAgoHHMM(15)}
              max={minutesAheadHHMM(15)}
              onChange={(e) => setFinishTime(e.target.value)}
              fullWidth={false}
            />
          </Field>
          <Button type="submit" variant="primary" className="w-full sm:w-auto">
            Clock out
          </Button>
        </form>
        {locationError && <p className="mt-2 text-xs text-accent">{locationError}</p>}
      </Card>
    )
  }

  return (
    <form action={clockInAction} className={cardClasses()}>
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="shift_id" value={shiftId} />
      <input type="hidden" name="misc_category" value={miscCategory} />
      <input type="hidden" name="lat" value={lat ?? ''} />
      <input type="hidden" name="lng" value={lng ?? ''} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <Field label="Clock in against" htmlFor="target" className="flex-1">
          <Select
            id="target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            fullWidth
          >
            {shifts.length > 0 && (
              <optgroup label="Your shifts">
                {shifts.map((shift) => (
                  <option key={shift.id} value={`shift:${shift.id}`}>
                    {shiftLabel(shift)}
                  </option>
                ))}
              </optgroup>
            )}
            {jobs.length > 0 && (
              <optgroup label="Jobs">
                {jobs.map((job) => (
                  <option key={job.id} value={`job:${job.id}`}>
                    {job.job_number ?? 'Job'} — {job.customerName ?? 'Customer'}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Other">
              {TIMESHEET_MISC_CATEGORIES.map((cat) => (
                <option key={cat} value={`misc:${cat}`}>
                  {TIMESHEET_MISC_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>

        <Field label="Start time" htmlFor="start_time">
          <Input
            id="start_time"
            name="start_time"
            type="time"
            value={startTime ?? nowHHMM()}
            min={minutesAgoHHMM(15)}
            max={minutesAheadHHMM(15)}
            onChange={(e) => setStartTime(e.target.value)}
            fullWidth={false}
          />
        </Field>

        <Button type="submit" variant="primary" className="w-full sm:w-auto">
          Clock in
        </Button>
      </div>
      {locationError && <p className="mt-2 text-xs text-accent">{locationError}</p>}
    </form>
  )
}
