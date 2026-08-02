'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Slide-over panel used by intercepted routes.
 *
 * Closing calls router.back() rather than hiding local state, because the panel
 * *is* a route: the URL changed when it opened, so the browser back button and
 * the close button must do the same thing. Hiding it locally would leave the URL
 * pointing at a job with nothing on screen.
 *
 * Full-height sheet on a phone, drawer on wider screens.
 */
export function SidePanel({
  title,
  subtitle,
  children,
  footer,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  const router = useRouter()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') router.back()
    }
    document.addEventListener('keydown', onKey)

    // Stop the page underneath scrolling while the panel is open — otherwise a
    // touch drag on the overlay scrolls the job list behind it.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    panelRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [router])

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close panel"
        onClick={() => router.back()}
        className="absolute inset-0 cursor-default bg-black/50"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative flex h-full w-full flex-col bg-background shadow-xl outline-none sm:max-w-lg"
      >
        <div className="flex items-start justify-between gap-4 border-b border-surface-border p-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-tight">{title}</h2>
            {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Close"
            className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-foreground sm:h-9 sm:w-9"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              &times;
            </span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">{children}</div>

        {footer && (
          <div className="border-t border-surface-border p-4">{footer}</div>
        )}
      </div>
    </div>
  )
}
