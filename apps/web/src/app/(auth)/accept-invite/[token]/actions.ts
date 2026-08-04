'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { setPendingConfirmationEmail } from '@/lib/pending-confirmation'
import { readableAuthError } from '@/lib/auth-errors'
import { PRIVACY_NOTICE_VERSION } from '@/lib/policies'

type InviteLookup = {
  email: string
  role: string
  company_name: string | null
  expires_at: string
  accepted_at: string | null
}

export async function acceptInvite(token: string, formData: FormData) {
  const fullName = String(formData.get('full_name') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  const supabase = await createClient()

  const { data: inviteData } = await supabase.rpc('get_invite_by_token', { p_token: token }).maybeSingle()
  const invite = inviteData as unknown as InviteLookup | null

  if (!invite || invite.accepted_at || new Date(invite.expires_at) < new Date()) {
    redirect(`/accept-invite/${token}?error=${encodeURIComponent('This invite is no longer valid.')}`)
  }

  if (formData.get('accept_privacy') !== 'on') {
    redirect(
      `/accept-invite/${token}?error=${encodeURIComponent('Please confirm you have read the privacy notice.')}`
    )
  }

  const { data, error } = await supabase.auth.signUp({
    email: invite.email,
    password,
    options: {
      data: { full_name: fullName, accepted_privacy_version: PRIVACY_NOTICE_VERSION },
    },
  })

  if (error) {
    const message = readableAuthError(
      error,
      'We could not set up your account. Please try again, or ask for a fresh invite.'
    )
    redirect(`/accept-invite/${token}?error=${encodeURIComponent(message)}`)
  }

  // Same dead end as signup, and worse here: accepting consumes the invite, so
  // a staff member who loses the confirmation email cannot reuse their link
  // either. Send them somewhere that can send it again.
  if (!data.session) {
    await setPendingConfirmationEmail(invite.email)
    redirect('/check-email')
  }

  redirect('/jobs')
}
