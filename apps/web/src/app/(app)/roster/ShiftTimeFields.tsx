'use client'

import { useState, useSyncExternalStore } from 'react'
import { Field, Input } from '@/components/ui'

const noop = () => () => {}

/**
 * The zone this device is in, or '' during the server render.
 *
 * Only used to decide whether to warn. `useSyncExternalStore` rather than an
 * effect so the two renders agree that the server produced nothing, which is
 * the pattern the app already uses for browser-only values.
 */
function useDeviceZone(): string {
  return useSyncExternalStore(
    noop,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
    () => ''
  )
}

/**
 * Start and finish pickers for a shift.
 *
 * These submit the wall clock exactly as typed ("2026-09-26T16:00") and let the
 * server convert it using the company's zone. It used to convert here, in the
 * browser, via `new Date(local).toISOString()` — which reads the string in
 * *this device's* zone. Correct for a manager sitting at the venue, an hour or
 * three out for one rostering from another country, and there was nothing on
 * screen to suggest which had happened.
 *
 * Converting on the server also removes the separate hidden `local_date` field:
 * the day a shift belongs to is now just the date half of what was typed, read
 * where it is used.
 *
 * Finish is a full date and time rather than just a time, because a pack-out
 * that starts at 8pm and ends at 2am belongs to one shift, not two.
 */
export default function ShiftTimeFields({
  idPrefix,
  defaultStart,
  defaultEnd,
  zone,
}: {
  idPrefix: string
  defaultStart: string
  defaultEnd: string
  /** The company's zone — what these times will be read as. */
  zone: string
}) {
  const [start, setStart] = useState(defaultStart)
  const [end, setEnd] = useState(defaultEnd)
  const deviceZone = useDeviceZone()

  // Compared as bare strings rather than Dates: both are wall clock in the same
  // zone, so lexical order is chronological order and no parsing is involved.
  const backwards = Boolean(start && end && end <= start)

  // Said only when it matters. A manager at the venue does not need telling
  // which clock they are on; one rostering from another country does, because
  // the times they type are the venue's and not the ones on their own wall.
  const elsewhere = Boolean(deviceZone) && deviceZone !== zone

  return (
    <>
      <Field
        label="Starts"
        htmlFor={`starts-${idPrefix}`}
        hint={elsewhere ? `${zone} time` : undefined}
      >
        <Input
          id={`starts-${idPrefix}`}
          name="starts_local"
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          required
          className="sm:w-52"
        />
      </Field>

      <Field
        label="Finishes"
        htmlFor={`ends-${idPrefix}`}
        error={backwards ? 'Finish has to be after the start.' : undefined}
      >
        <Input
          id={`ends-${idPrefix}`}
          name="ends_local"
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          required
          className="sm:w-52"
        />
      </Field>
    </>
  )
}
