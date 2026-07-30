'use client'

import { useEffect, useState } from 'react'
import { TIMESHEET_MISC_CATEGORIES, TIMESHEET_MISC_CATEGORY_LABELS } from '@trade-assist/db'

type JobOption = { id: string; job_number: string | null; customerName: string | null }

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
  geofenceEnabled: boolean
  clockInAction: (formData: FormData) => void
  clockOutAction: (formData: FormData) => void
}) {
  const [target, setTarget] = useState(jobs.length > 0 ? `job:${jobs[0].id}` : `misc:${TIMESHEET_MISC_CATEGORIES[0]}`)
  const [startTime, setStartTime] = useState(nowHHMM())
  const [finishTime, setFinishTime] = useState(nowHHMM())
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

  const isJobTarget = target.startsWith('job:')
  const jobId = isJobTarget ? target.slice(4) : ''
  const miscCategory = isJobTarget ? '' : target.slice(5)

  if (openEntry) {
    return (
      <div className="rounded-lg border border-surface-border p-4">
        <p className="text-sm">
          Clocked in to <span className="font-medium">{openEntry.label}</span> since{' '}
          <span className="font-medium">{openEntry.clockInTime}</span>
        </p>
        <form action={clockOutAction} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="lat" value={lat ?? ''} />
          <input type="hidden" name="lng" value={lng ?? ''} />
          <div className="flex flex-col gap-1">
            <label htmlFor="finish_time" className="text-xs font-medium">
              Finish time
            </label>
            <input
              id="finish_time"
              name="finish_time"
              type="time"
              value={finishTime}
              min={nowHHMM()}
              max={minutesAheadHHMM(15)}
              onChange={(e) => setFinishTime(e.target.value)}
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            Clock out
          </button>
        </form>
        {locationError && <p className="mt-2 text-xs text-accent">{locationError}</p>}
      </div>
    )
  }

  return (
    <form action={clockInAction} className="rounded-lg border border-surface-border p-4">
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="misc_category" value={miscCategory} />
      <input type="hidden" name="lat" value={lat ?? ''} />
      <input type="hidden" name="lng" value={lng ?? ''} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="target" className="text-xs font-medium">
            Clock in against
          </label>
          <select
            id="target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
          >
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
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="start_time" className="text-xs font-medium">
            Start time
          </label>
          <input
            id="start_time"
            name="start_time"
            type="time"
            value={startTime}
            min={minutesAgoHHMM(15)}
            max={nowHHMM()}
            onChange={(e) => setStartTime(e.target.value)}
            className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </div>

        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          Clock in
        </button>
      </div>
      {locationError && <p className="mt-2 text-xs text-accent">{locationError}</p>}
    </form>
  )
}
