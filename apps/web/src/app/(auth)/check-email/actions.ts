'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getPendingConfirmationEmail,
  setPendingConfirmationEmail,
} from '@/lib/pending-confirmation'

export async function resendConfirmation(formData: FormData) {
  // Prefer the cookie over the submitted field. Someone arriving from the
  // "Email not confirmed" login error has no cookie and types their address,
  // which is unavoidable — but a fresh signup never needs to send it again.
  const cookieEmail = await getPendingConfirmationEmail()
  const email = cookieEmail ?? String(formData.get('email') ?? '').trim()

  if (!email) {
    redirect('/check-email?error=Enter+the+email+address+you+signed+up+with.')
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.resend({ type: 'signup', email })

  if (error) {
    // Rate-limit messages are worth showing verbatim — "wait 47 seconds" is
    // actionable, and it reveals nothing about whether the account exists.
    const isRateLimit = error.status === 429 || /second/i.test(error.message)
    if (isRateLimit) {
      redirect(`/check-email?error=${encodeURIComponent(error.message)}`)
    }
    // Everything else is deliberately swallowed into the same generic message
    // below, so this page cannot be used to discover which addresses have
    // accounts.
  }

  if (!cookieEmail) await setPendingConfirmationEmail(email)

  redirect('/check-email?sent=1')
}
