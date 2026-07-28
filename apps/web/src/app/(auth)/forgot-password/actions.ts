'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBaseUrl } from '@/lib/url'

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()

  if (!email) {
    redirect(`/forgot-password?error=${encodeURIComponent('Enter your email address.')}`)
  }

  const supabase = await createClient()
  const baseUrl = await getBaseUrl()

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${baseUrl}/reset-password`,
  })

  // Always show the same message whether or not the email has an account,
  // so this form can't be used to check who's signed up.
  redirect(
    `/forgot-password?message=${encodeURIComponent('If an account exists for that email, a reset link has been sent.')}`
  )
}
