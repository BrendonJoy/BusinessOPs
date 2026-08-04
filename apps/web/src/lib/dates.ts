/**
 * Date formatting for the app.
 *
 * The locale is pinned rather than left to the runtime. `toLocaleDateString()`
 * with no locale resolves to Node's default on the server and the browser's on
 * the client — in a client component that renders "7/28/2026" server-side and
 * "28/07/2026" on hydration, which React reports as a hydration mismatch and
 * throws away the server HTML for. Pinning makes the two agree, and day-first
 * matches what the app's users read.
 *
 * Date-only (`YYYY-MM-DD`) values are parsed into a *local* Date rather than
 * passed to `new Date(iso)`, which reads them as UTC midnight and renders as
 * the previous day for anyone behind UTC. NZ is ahead so it wouldn't show up
 * locally — it would show for a customer opening a quote link from the UK.
 */

const LOCALE = 'en-NZ'

function toLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "5 Aug 2026" — the app's standard way of showing a date-only value. */
export function formatDate(ymd: string | null | undefined, fallback = '—'): string {
  if (!ymd) return fallback
  return toLocalDate(ymd).toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** "Wed 5 Aug" — for calendar and timesheet columns, where the year is implied. */
export function formatDayLabel(ymd: string): string {
  return toLocalDate(ymd).toLocaleDateString(LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/**
 * Local `YYYY-MM-DD` for a Date — the inverse of toLocalDate, so a Date can be
 * handed to formatDate and friends. Built from local parts on purpose:
 * `toISOString()` converts to UTC first and shifts the date across midnight.
 */
export function toYmd(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** "5/08/2026" — the date part of a full ISO timestamp (created_at, superseded_at). */
export function formatTimestampDate(iso: string | null | undefined, fallback = '—'): string {
  if (!iso) return fallback
  return new Date(iso).toLocaleDateString(LOCALE)
}
