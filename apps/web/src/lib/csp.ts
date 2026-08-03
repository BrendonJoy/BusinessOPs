/**
 * Content Security Policy.
 *
 * Built per-request because `script-src` carries a nonce. Next.js reads the
 * nonce back off the *request* `Content-Security-Policy` header during render
 * and stamps it onto its own framework and page scripts, which is what makes
 * `'strict-dynamic'` workable without hand-annotating every tag.
 */

/**
 * The browser talks directly to Supabase for auth token refresh, storage
 * uploads and signed-URL images, so its origin has to be allowed explicitly.
 * Google Maps deliberately does NOT appear anywhere in this policy: every Maps
 * call is made server-side from `lib/google-maps.ts`, so the browser never
 * contacts Google and the API key never leaves the server.
 */
function supabaseOrigin(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return ''
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

export function buildContentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development'
  const supabase = supabaseOrigin()
  const supabaseSocket = supabase.replace(/^https:/, 'wss:')

  const directives = [
    `default-src 'self'`,

    // 'strict-dynamic' tells the browser to trust scripts loaded *by* an
    // already-trusted script, which is how Next's bootstrap loads its chunks.
    // It also makes the browser ignore 'self' and any host allowlist here — the
    // nonce becomes the only thing that grants execution, which is the point.
    // Dev needs 'unsafe-eval': React uses eval to rebuild server error stacks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,

    // 'unsafe-inline' rather than a nonce, deliberately. The calendar positions
    // day cells, hour rows and drag previews with computed `style` attributes
    // (CalendarGrid, DayView) — pixel values that cannot be Tailwind classes.
    // A nonce does not cover style *attributes*, only <style> elements, so a
    // nonce here would silently break the calendar layout. Inline styles are a
    // far weaker injection vector than scripts, so this is the right trade.
    `style-src 'self' 'unsafe-inline'`,

    // blob: and data: cover local photo previews before upload; the Supabase
    // origin covers signed-URL job photos and company logos.
    `img-src 'self' blob: data: ${supabase}`.trim(),

    // next/font/google self-hosts at build time, so no external font origin.
    `font-src 'self'`,

    `connect-src 'self' ${supabase} ${supabaseSocket}${isDev ? ' ws:' : ''}`.replace(/\s+/g, ' ').trim(),

    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ]

  return directives.join('; ')
}
