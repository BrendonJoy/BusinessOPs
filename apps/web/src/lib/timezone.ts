/**
 * Turning wall-clock times into instants, and back, in a named zone.
 *
 * The app stores instants (`timestamptz`) and shows people wall clock. Both
 * conversions need a zone, and the right zone is the company's — see migration
 * 0043. Everything here takes it explicitly rather than reading a default,
 * because a function that silently falls back to the runtime's zone is exactly
 * the bug this replaces: correct on a laptop in Auckland, wrong on Vercel.
 *
 * Offsets are derived from the name for the instant in question, never stored.
 * NZ moves an hour twice a year, so an offset is only true for one date.
 */

/** Only reached when a zone is missing entirely; matches the column default. */
export const DEFAULT_TIMEZONE = 'Pacific/Auckland'

const LOCALE = 'en-NZ'

export function isValidTimezone(zone: string): boolean {
  if (!zone) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/**
 * Every zone the runtime knows, for the picker. Node and browsers have had this
 * since ES2022; if a runtime lacks it the picker falls back to a short list
 * rather than rendering an empty select.
 */
export function allTimezones(): string[] {
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
  const zones = supported ? supported('timeZone') : []
  return zones.length > 0 ? zones : FALLBACK_ZONES
}

const FALLBACK_ZONES = [
  'Pacific/Auckland',
  'Australia/Sydney',
  'Australia/Brisbane',
  'Australia/Adelaide',
  'Australia/Perth',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
]

// hourCycle 'h23' rather than hour12:false: the latter can yield hour "24" at
// midnight on some engines, which arithmetic below would read as the next day.
function partsFormatter(zone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
}

function wallClockParts(zone: string, at: Date) {
  const parts = partsFormatter(zone).formatToParts(at)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

/**
 * The zone's offset at a given instant, in the same sign convention as
 * `Date.getTimezoneOffset()`: UTC minus local, so Auckland in winter is -720.
 *
 * Kept in that convention on purpose — it is what the existing timesheet and
 * chat code already expects, so this drops in where the browser's value used to.
 */
export function zoneOffsetMinutes(zone: string, at: Date = new Date()): number {
  const p = wallClockParts(zone, at)
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return -Math.round((asIfUtc - at.getTime()) / 60_000)
}

/**
 * "2026-09-26" + "16:00" in a zone → the instant that actually is.
 *
 * Two passes, because the offset needed is the one in force at the *result*, not
 * at the guess. They differ only across a DST boundary, which is precisely the
 * night somebody rosters a pack-out and would otherwise be an hour out.
 *
 * An hour that does not exist (the spring-forward gap) resolves to the instant
 * the clock reaches next, and an hour that happens twice resolves to the first.
 * Both are defensible; neither is worth a UI for.
 */
export function wallClockToInstant(zone: string, ymd: string, hhmm: string): string | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim())
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!dateMatch || !timeMatch) return null

  const hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])
  if (hour > 23 || minute > 59) return null

  const naive = Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    hour,
    minute
  )

  const guessed = zoneOffsetMinutes(zone, new Date(naive))
  let instant = naive + guessed * 60_000
  const settled = zoneOffsetMinutes(zone, new Date(instant))
  if (settled !== guessed) instant = naive + settled * 60_000

  return new Date(instant).toISOString()
}

/** Accepts what a `datetime-local` input submits: "2026-09-26T16:00". */
export function localInputToInstant(zone: string, value: string): string | null {
  const [date, time] = value.split('T')
  if (!date || !time) return null
  return wallClockToInstant(zone, date, time.slice(0, 5))
}

/** The inverse, for pre-filling a `datetime-local` input. */
export function instantToLocalInput(zone: string, iso: string): string {
  const p = wallClockParts(zone, new Date(iso))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

/** The date a given instant falls on in the zone — "2026-09-26". */
export function ymdInZone(zone: string, at: Date = new Date()): string {
  const p = wallClockParts(zone, at)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** Today, where the business is. Not where the server is, and not where the reader is. */
export function todayInZone(zone: string): string {
  return ymdInZone(zone)
}

/**
 * Formats a stored instant in the company's zone. The same call gives the same
 * answer on the server and in the browser, which is what makes it safe to render
 * during SSR — the previous approach had to blank out server-side because it
 * depended on the runtime's zone.
 */
export function formatInZone(
  iso: string,
  zone: string,
  options: Intl.DateTimeFormatOptions
): string {
  return new Date(iso).toLocaleString(LOCALE, { ...options, timeZone: zone })
}

/**
 * "UTC+12:00" style label for the picker, so a name nobody recognises still
 * tells you something. Computed for now, so it reflects daylight saving as it
 * currently stands rather than a nominal offset.
 */
export function zoneOffsetLabel(zone: string, at: Date = new Date()): string {
  const minutes = -zoneOffsetMinutes(zone, at)
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}
