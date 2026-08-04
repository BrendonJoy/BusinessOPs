'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { setPendingConfirmationEmail } from '@/lib/pending-confirmation'
import { readableAuthError } from '@/lib/auth-errors'

export async function signup(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  const fullName = String(formData.get('full_name') ?? '')
  const companyName = String(formData.get('company_name') ?? '')

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, company_name: companyName },
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
