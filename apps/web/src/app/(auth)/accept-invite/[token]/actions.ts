'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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

  const { data, error } = await supabase.auth.signUp({
    email: invite.email,
    password,
    options: {
      data: { full_name: fullName },
    },
  })

  if (error) {
    redirect(`/accept-invite/${token}?error=${encodeURIComponent(error.message)}`)
  }

  if (!data.session) {
    redirect(`/login?message=${encodeURIComponent('Check your email to confirm your account, then log in.')}`)
  }

  redirect('/jobs')
}
