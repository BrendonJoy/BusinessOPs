import { formatInZone } from '@/lib/timezone'

/**
 * Renders a stored instant in the *company's* zone.
 *
 * This used to render in the viewer's zone, which meant it could not run on the
 * server at all: formatting a shift during SSR would have used Vercel's UTC and
 * shown a 4pm Auckland call as 4am on the previous day, so the server render was
 * deliberately blanked and the real time appeared on hydration.
 *
 * With the zone stored on the company (migration 0043) both renders agree, so
 * the blank is gone — and, more importantly, two people looking at the same
 * shift from different countries now read the same time. A roster is a shared
 * document; "4pm" has to mean one thing.
 */

export type LocalTimeFormat = 'time' | 'datetime' | 'date'

// hourCycle 'h23' rather than hour12:false, which can render midnight as 24:00.
const OPTIONS: Record<LocalTimeFormat, Intl.DateTimeFormatOptions> = {
  time: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
  datetime: {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  },
  date: { weekday: 'short', day: 'numeric', month: 'short' },
}

export default function LocalTime({
  iso,
  zone,
  format = 'time',
}: {
  iso: string
  zone: string
  format?: LocalTimeFormat
}) {
  return <span>{formatInZone(iso, zone, OPTIONS[format])}</span>
}

/**
 * "16:00 – 23:00", or "16:00 – 02:00 (2 Sept)" when the finish lands on another
 * day. The trailing date is not decoration: a pack-out crew needs to see that
 * the shift they are reading runs past midnight.
 */
export function LocalTimeRange({
  start,
  end,
  zone,
}: {
  start: string
  end: string
  zone: string
}) {
  // Compared as dates *in the company's zone*, not as instants. A shift running
  // 20:00 to 02:00 spans midnight there while a UTC comparison might put both
  // ends on the same day, which is exactly when the crew needs telling.
  const dayOf = (iso: string) => formatInZone(iso, zone, { year: 'numeric', month: '2-digit', day: '2-digit' })
  const sameDay = dayOf(start) === dayOf(end)

  return (
    <span>
      {formatInZone(start, zone, OPTIONS.time)} – {formatInZone(end, zone, OPTIONS.time)}
      {!sameDay && (
        <span className="ml-1 text-muted">
          ({formatInZone(end, zone, { day: 'numeric', month: 'short' })})
        </span>
      )}
    </span>
  )
}
