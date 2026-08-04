'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { setPendingConfirmationEmail } from '@/lib/pending-confirmation'
import { readableAuthError } from '@/lib/auth-errors'
import { PRIVACY_NOTICE_VERSION } from '@/lib/policies'

export async function signup(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  const fullName = String(formData.get('full_name') ?? '')
  const companyName = String(formData.get('company_name') ?? '')

  // Checked server-side as well as in the browser. `required` on the input is a
  // convenience for people, not a control — this is the record we would rely on
  // to show what someone agreed to.
  if (formData.get('accept_privacy') !== 'on') {
    redirect(`/signup?error=${encodeURIComponent('Please confirm you have read the privacy notice.')}`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // The version travels in user metadata because there is no session at
      // this point to write an acceptance row with — handle_new_user picks it
      // up and records it alongside the profile. See migration 0033.
      data: {
        full_name: fullName,
        company_name: companyName,
        accepted_privacy_version: PRIVACY_NOTICE_VERSION,
      },
    },
  })

  if (error) {
    const message = readableAuthError(
      error,
      'We could not create your account. Check the email address and try again.'
    )
    redirect(`/signup?error=${encodeURIComponent(message)}`)
  }

  // No session means email confirmation is required. Sending people to the
  // login form here reads as failure — a login form is what you see when
  // something went wrong, so the "check your email" notice loses the argument.
  // Its own screen can say what happened and offer a resend.
  if (!data.session) {
    await setPendingConfirmationEmail(email)
    redirect('/check-email')
  }

  redirect('/dashboard')
}
