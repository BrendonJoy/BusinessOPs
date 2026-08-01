import type { ReactNode } from 'react'
import { cx } from './styles'

/** The inline message block used for form results, empty states and hints. */
export function Notice({
  tone = 'info',
  className,
  children,
}: {
  tone?: 'info' | 'error'
  className?: string
  children: ReactNode
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : undefined}
      className={cx(
        'rounded-md px-3 py-2 text-sm',
        tone === 'error'
          ? 'bg-red-600/10 text-red-700 dark:text-red-400'
          : 'bg-accent/10 text-accent',
        className,
      )}
    >
      {children}
    </p>
  )
}

/** Placeholder shown where a list or table has nothing to display. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-surface-border px-4 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
