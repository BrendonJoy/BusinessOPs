import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { buildContentSecurityPolicy } from '@/lib/csp'

const AUTH_PATHS = ['/login', '/signup', '/forgot-password', '/check-email']
const PUBLIC_PATHS = [
  '/q',
  '/api/calendar',
  '/api/cron',
  '/reset-password',
  '/accept-invite',
  // PWA install assets. The browser fetches these WITHOUT the user's session —
  // often before sign-in and sometimes from a service worker context — so
  // redirecting them to /login silently makes the app non-installable: the
  // manifest parses as HTML and the icons resolve to a login page.
  '/manifest.webmanifest',
  '/icons/',
  '/icon.png',
  '/apple-icon.png',
  // Same trap as the manifest above: a crawler is never signed in, so without
  // this it receives a redirect to /login and never reads the disallow rule —
  // the file exists, serves 200 to a human, and does nothing.
  '/robots.txt',
]

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = buildContentSecurityPolicy(nonce)

  // Next.js discovers the nonce by parsing the CSP header on the *request*, so
  // it has to be set on the forwarded request as well as the response. Built
  // from `request.headers` at call time so that any cookies Supabase has just
  // refreshed are already present — rebuilding it earlier would forward a stale
  // session to the render and log people out on token refresh.
  const forwardHeaders = () => {
    const headers = new Headers(request.headers)
    headers.set('x-nonce', nonce)
    headers.set('Content-Security-Policy', csp)
    return headers
  }

  let response = NextResponse.next({ request: { headers: forwardHeaders() } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: forwardHeaders() } })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthPath = AUTH_PATHS.some((path) => request.nextUrl.pathname.startsWith(path))
  const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path))

  if (!user && !isAuthPath && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return withCsp(NextResponse.redirect(url), csp)
  }

  if (user && isAuthPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return withCsp(NextResponse.redirect(url), csp)
  }

  return withCsp(response, csp)
}

function withCsp(response: NextResponse, csp: string): NextResponse {
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
