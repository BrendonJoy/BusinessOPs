import type { ComponentProps, ReactNode } from 'react'
import { cx, inputClasses, type ControlSize } from './styles'

type Sized = { size?: ControlSize; fullWidth?: boolean }

export function Input({
  size,
  fullWidth,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'size'> & Sized) {
  return <input className={inputClasses(size, className, fullWidth)} {...props} />
}

export function Textarea({
  size,
  fullWidth,
  className,
  ...props
}: ComponentProps<'textarea'> & Sized) {
  return <textarea className={inputClasses(size, cx('min-h-24', className), fullWidth)} {...props} />
}

/**
 * Defaults to auto width — selects are usually sized by their longest option.
 *
 * The native `size` attribute (a row count) is omitted so it doesn't collide
 * with our control-size prop; without the Omit the two types intersect to
 * `undefined` and `size` silently stops accepting anything.
 */
export function Select({
  size,
  fullWidth = false,
  className,
  ...props
}: Omit<ComponentProps<'select'>, 'size'> & Sized) {
  return <select className={inputClasses(size, className, fullWidth)} {...props} />
}

/**
 * Label + control + hint/error. `htmlFor` is required rather than generated —
 * these render inside server components, where hooks like useId aren't available.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: ReactNode
  htmlFor: string
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-muted">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}
