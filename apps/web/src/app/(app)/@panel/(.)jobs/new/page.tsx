'use client'

import { useEffect } from 'react'

/**
 * Safety net so /jobs/new can never be swallowed by the job panel.
 *
 * `(.)jobs/[id]` is a dynamic segment and happily matches "new" as a job id.
 * The panel then found no such job and called notFound(), which rendered the
 * 404 for the whole route and took the real new-job form down with it —
 * creating a job from the list was completely broken.
 *
 * A static segment beats a dynamic one, so this file claims /jobs/new inside
 * the @panel slot. But that alone is not enough: interception deliberately
 * leaves the `children` slot on the previous route, so a soft navigation here
 * would sit on /jobs/new while still showing the jobs list.
 *
 * The links that matter are plain anchors, so they hard-navigate and never
 * reach this file. This exists for any route that soft-navigates here anyway:
 * it forces the full load that interception prevented.
 *
 * Any future static route under /jobs (e.g. /jobs/import) needs the same
 * treatment, or it will be intercepted as a job id.
 */
export default function EscapeInterception() {
  useEffect(() => {
    window.location.replace('/jobs/new')
  }, [])

  return null
}
