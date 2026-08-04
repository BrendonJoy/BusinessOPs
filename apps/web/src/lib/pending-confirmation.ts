import { cookies } from 'next/headers'

/**
 * Holds the address a signup is waiting on, so the confirmation screen can name
 * it without putting an email address in a URL — query strings end up in server
 * logs, browser history and any referer header that leaves the site.
 *
 * Short-lived: it exists to bridge the redirect straight after signup, not to
 * remember anyone.
 *
 * Lives here rather than beside the page because a `'use server'` module may
 * only export async functions — a constant or a plain helper in one is a build
 * error, not a lint warning.
 */
const PENDING_EMAIL_COOKIE = 'pending_confirmation_email'
const PENDING_EMAIL_MAX_AGE = 60 * 30

export async function setPendingConfirmationEmail(email: string) {
  const store = await cookies()
  store.set(PENDING_EMAIL_COOKIE, email, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: PENDING_EMAIL_MAX_AGE,
  })
}

export async function getPendingConfirmationEmail(): Promise<string | null> {
  const store = await cookies()
  return store.get(PENDING_EMAIL_COOKIE)?.value ?? null
}
