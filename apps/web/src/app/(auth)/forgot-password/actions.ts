'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()

  if (!email) {
    redirect(`/forgot-password?error=${encodeURIComponent('Enter your email address.')}`)
  }

  const supabase = await createClient()

  // No redirectTo: the email carries a 6-digit code ({{ .Token }} in the
  // Supabase "Reset Password" template), not a link. Links get consumed by
  // corporate mail scanners — Microsoft Safe Links fetches every URL in an
  // inbound message, spending the single-use token before the user clicks.
  await supabase.auth.resetPasswordForEmail(email)

  // Same response whether or not the address has an account, so this form
  // can't be used to enumerate who has signed up. The email is carried through
  // only so the next page can prefill it.
  redirect(`/reset-password?email=${encodeURIComponent(email)}`)
}
