'use client'

import { useState } from 'react'
import { Field, Input } from '@/components/ui'

/**
 * Start and finish pickers that submit real instants.
 *
 * A `datetime-local` input yields a bare wall-clock string with no timezone.
 * Posting that straight into a timestamptz column makes Postgres read it in the
 * server's zone — UTC in production — so every shift silently moves by the
 * user's offset. In New Zealand that is half a working day.
 *
 * The visible inputs are deliberately unnamed so they are never submitted; the
 * hidden fields carry `new Date(local).toISOString()`, which is the instant the
 * person actually meant, because the browser parses the bare string in its own
 * zone.
 *
 * Finish is a full date and time rather than just a time, because a pack-out
 * that starts at 8pm and ends at 2am belongs to one shift, not two.
 */
export default function ShiftTimeFields({
  idPrefix,
  defaultStart,
  defaultEnd,
}: {
  idPrefix: string
  defaultStart: string
  defaultEnd: string
}) {
  const [start, setStart] = useState(defaultStart)
  const [end, setEnd] = useState(defaultEnd)

  const toInstant = (local: string) => {
    const parsed = new Date(local)
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString()
  }

  const backwards = Boolean(start && end && new Date(end) <= new Date(start))

  return (
    <>
      <Field label="Starts" htmlFor={`starts-${idPrefix}`}>
        <Input
          id={`starts-${idPrefix}`}
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
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          required
          className="sm:w-52"
        />
      </Field>

      <input type="hidden" name="starts_at" value={toInstant(start)} />
      <input type="hidden" name="ends_at" value={toInstant(end)} />
    </>
  )
}
