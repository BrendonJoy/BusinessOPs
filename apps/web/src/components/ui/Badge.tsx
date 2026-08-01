import type { ReactNode } from 'react'
import { cx } from './styles'

type Tone = 'neutral' | 'accent' | 'muted'

const TONES: Record<Tone, string> = {
  neutral: 'border border-surface-border',
  accent: 'bg-accent/10 text-accent',
  muted: 'bg-surface text-muted',
}

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
