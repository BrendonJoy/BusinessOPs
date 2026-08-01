/**
 * Shared class recipes for the BusinessOps UI.
 *
 * These codify the patterns that were already copy-pasted across the app rather
 * than introducing a new look. Two things changed deliberately in the move:
 *
 * 1. Interactive controls get a 44px minimum height on touch viewports (the
 *    Apple/Android tap-target floor) and relax to the old denser sizing at `sm:`.
 * 2. Focus states are now visible rings rather than a border colour swap, which
 *    was nearly invisible against the monochrome palette.
 *
 * Exported as functions rather than only components so existing `<Link>` and
 * bare `<input>` call sites can adopt the styling without being restructured.
 */

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ControlSize = 'sm' | 'md'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-foreground hover:opacity-90 disabled:hover:opacity-100',
  secondary:
    'border border-surface-border hover:border-accent disabled:hover:border-surface-border',
  ghost: 'text-muted hover:text-accent hover:bg-surface',
  danger:
    'border border-surface-border text-red-600 hover:border-red-600 dark:text-red-400 dark:hover:border-red-400',
}

const BUTTON_SIZES: Record<ControlSize, string> = {
  sm: 'min-h-9 px-3 py-1.5 text-xs sm:min-h-0',
  md: 'min-h-11 px-4 py-2 text-sm sm:min-h-9',
}

export function buttonClasses(
  variant: ButtonVariant = 'secondary',
  size: ControlSize = 'md',
  className?: string,
) {
  return cx(
    'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-50',
    FOCUS_RING,
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    className,
  )
}

const CONTROL_SIZES: Record<ControlSize, string> = {
  sm: 'min-h-9 px-2 py-1 text-xs sm:min-h-0',
  md: 'min-h-11 px-3 py-2 text-sm sm:min-h-9',
}

/**
 * `fullWidth` is a flag rather than something callers override with `w-auto`,
 * because two width utilities in the same class string resolve by stylesheet
 * order, not by which one the caller wrote last — the result is a coin flip.
 */
export function inputClasses(size: ControlSize = 'md', className?: string, fullWidth = true) {
  return cx(
    'rounded-md border border-surface-border bg-background transition-colors',
    'placeholder:text-muted disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted',
    fullWidth && 'w-full',
    FOCUS_RING,
    CONTROL_SIZES[size],
    className,
  )
}

export function cardClasses(className?: string) {
  return cx('rounded-lg border border-surface-border p-4', className)
}

/** Checkbox/radio sized for a thumb rather than a mouse pointer. */
export function checkboxClasses(className?: string) {
  return cx('h-5 w-5 shrink-0 rounded border-surface-border accent-accent sm:h-4 sm:w-4', FOCUS_RING, className)
}
