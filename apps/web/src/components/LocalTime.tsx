'use client'

import { useSyncExternalStore } from 'react'

const LOCALE = 'en-NZ'

const noop = () => () => {}

/**
 * Renders a stored instant in the *viewer's* timezone.
 *
 * Shift times are timestamptz. Formatting them during the server render would
 * use the server's zone — UTC on Vercel — so a shift starting at 4pm in
 * Auckland would render as 4am, on the previous day. Formatting has to happen
 * in the browser.
 *
 * The server snapshot is deliberately empty rather than a UTC-formatted string.
 * A blank that fills in on hydration is honest; a wrong time that silently
 * corrects itself is worse, because anyone reading quickly believes the first
 * value. It also avoids a hydration mismatch, since the two renders agree that
 * the server produced nothing.
 *
 * `useSyncExternalStore` rather than an effect: setting state in an effect for
 * this trips `react-hooks/set-state-in-effect`, and this is the pattern already
 * used elsewhere in the app for browser-only values.
 */
function useIsClient(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false
  )
}

export type LocalTimeFormat = 'time' | 'datetime' | 'date'

const OPTIONS: Record<LocalTimeFormat, Intl.DateTimeFormatOptions> = {
  time: { hour: '2-digit', minute: '2-digit', hour12: false },
  datetime: {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  },
  date: { weekday: 'short', day: 'numeric', month: 'short' },
}

export default function LocalTime({
  iso,
  format = 'time',
}: {
  iso: string
  format?: LocalTimeFormat
}) {
  const isClient = useIsClient()
  if (!isClient) return <span className="opacity-0">--:--</span>

  return <span>{new Date(iso).toLocaleString(LOCALE, OPTIONS[format])}</span>
}

/**
 * "16:00 – 23:00", or "16:00 – 02:00 (2 Sept)" when the finish lands on another
 * day. The trailing date is not decoration: a pack-out crew needs to see that
 * the shift they are reading runs past midnight.
 */
export function LocalTimeRange({ start, end }: { start: string; end: string }) {
  const isClient = useIsClient()
  if (!isClient) return <span className="opacity-0">--:-- – --:--</span>

  const from = new Date(start)
  const to = new Date(end)
  const sameDay = from.toDateString() === to.toDateString()

  return (
    <span>
      {from.toLocaleString(LOCALE, OPTIONS.time)} – {to.toLocaleString(LOCALE, OPTIONS.time)}
      {!sameDay && (
        <span className="ml-1 text-muted">
          ({to.toLocaleString(LOCALE, { day: 'numeric', month: 'short' })})
        </span>
      )}
    </span>
  )
}
