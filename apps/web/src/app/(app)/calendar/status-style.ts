import type { JobStatus } from '@trade-assist/db'

/**
 * Status colour for calendar chips.
 *
 * The brand chrome stays monochrome; colour is used only where it carries
 * meaning, and this is the clearest case for it — the whole point of a calendar
 * is scanning a month and seeing what state everything is in without reading.
 *
 * Tinted backgrounds rather than solid fills, so a busy week doesn't turn into
 * a patchwork that fights the rest of the UI. Every entry sets an explicit text
 * colour for light and dark, because a tint that reads well on near-black is
 * illegible on white and vice versa.
 *
 * Hues follow the convention people already expect: amber for "not confirmed",
 * blue for "planned", green for "happening", violet for "money out", muted for
 * "done", red for "cancelled".
 */
export const STATUS_CHIP: Record<JobStatus, string> = {
  quoted:
    'border border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  scheduled:
    'border border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300',
  in_progress:
    'border border-emerald-500/50 bg-emerald-500/20 font-medium text-emerald-700 dark:text-emerald-300',
  completed:
    'border border-surface-border bg-surface text-muted',
  invoiced:
    'border border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-300',
  cancelled:
    'border border-rose-500/30 bg-rose-500/10 text-rose-700 line-through dark:text-rose-300',
}

/** Small dot, for legends and dense rows where a full chip is too heavy. */
export const STATUS_DOT: Record<JobStatus, string> = {
  quoted: 'bg-amber-500',
  scheduled: 'bg-sky-500',
  in_progress: 'bg-emerald-500',
  completed: 'bg-surface-border',
  invoiced: 'bg-violet-500',
  cancelled: 'bg-rose-500',
}

/** Short time label for a chip: "9:00", or empty when a job has no set time. */
export function timeLabel(time: string | null): string {
  return time ? time.slice(0, 5) : ''
}
