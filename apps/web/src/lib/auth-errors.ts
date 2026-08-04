import type { AuthError } from '@supabase/supabase-js'

/**
 * Supabase does not always hand back a usable message. A rejected address or a
 * failed confirmation send comes back with an empty body, and the message
 * serialises to the literal string "{}" — which was being shown to users as
 * their entire explanation of what went wrong.
 *
 * Returns something a person can act on, and pushes the real error to the
 * server log where it is of some actual use.
 */
export function readableAuthError(error: AuthError, fallback: string): string {
  const raw = error.message?.trim() ?? ''
  const usable = raw && raw !== '{}' && raw !== '[object Object]'

  if (!usable) console.error('auth call failed with an unusable error', error)

  return usable ? raw : fallback
}
