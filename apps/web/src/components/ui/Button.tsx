import Link from 'next/link'
import type { ComponentProps } from 'react'
import { buttonClasses, type ButtonVariant, type ControlSize } from './styles'

type Shared = {
  variant?: ButtonVariant
  size?: ControlSize
}

export function Button({
  variant,
  size,
  className,
  type = 'button',
  ...props
}: Shared & ComponentProps<'button'>) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />
}

/** Same styling as Button, for navigation rather than actions. */
export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: Shared & ComponentProps<typeof Link>) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />
}
