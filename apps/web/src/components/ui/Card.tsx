import type { ComponentProps, ReactNode } from 'react'
import { cardClasses, cx } from './styles'

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cardClasses(className)} {...props} />
}

/** Label-over-value tile used in the reports and dashboard summary rows. */
export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  className?: string
}) {
  return (
    <div className={cardClasses(className)}>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  )
}

export function CardHeader({
  title,
  action,
  className,
}: {
  title: ReactNode
  /** Optional control shown opposite the title — wraps below it on narrow screens. */
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('mb-3 flex flex-wrap items-center justify-between gap-2', className)}>
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {action}
    </div>
  )
}
