'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getBaseUrl } from '@/lib/url'
import { getCurrentProfile, isCompanyAdmin } from '@/lib/roles'
import { sendTeamInviteEmail } from '@/lib/email'

function errorRedirect(message: string): never {
  redirect(`/settings?error=${encodeURIComponent(message)}`)
}

export async function inviteTeamMember(formData: FormData) {
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile || !isCompanyAdmin(profile.role)) errorRedirect('Only owners and admins can invite teammates.')

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const role = String(formData.get('role') ?? 'staff')

  if (!email) errorRedirect('Enter an email address.')
  if (role !== 'admin' && role !== 'staff') errorRedirect('Invalid role.')

  const { data: company } = await supabase.from('companies').select('name').eq('id', profile.company_id).single()

  const { data: invite, error } = await supabase
    .from('company_invites')
    .insert({ company_id: profile.company_id, email, role, invited_by: profile.id })
    .select('token')
    .single()

  if (error) errorRedirect(error.message)

  const baseUrl = await getBaseUrl()
  const result = await sendTeamInviteEmail({
    to: email,
    companyName: company?.name ?? 'BusinessOps',
    role,
    inviteUrl: `${baseUrl}/accept-invite/${invite!.token}`,
  })

  if (!result.sent && result.reason === 'send_failed') {
    errorRedirect(`Invite created, but the email failed to send: ${result.message}`)
  }

  revalidatePath('/settings')
}

export async function revokeInvite(inviteId: string) {
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile || !isCompanyAdmin(profile.role)) errorRedirect('Only owners and admins can revoke invites.')

  const { error } = await supabase.from('company_invites').delete().eq('id', inviteId)
  if (error) errorRedirect(error.message)

  revalidatePath('/settings')
}

export async function updateMemberRole(profileId: string, formData: FormData) {
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile || !isCompanyAdmin(profile.role)) errorRedirect('Only owners and admins can change roles.')

  const role = String(formData.get('role') ?? '')
  if (role !== 'admin' && role !== 'staff') errorRedirect('Invalid role.')

  const { error } = await supabase.from('profiles').update({ role }).eq('id', profileId)
  if (error) errorRedirect(error.message)

  revalidatePath('/settings')
}

export async function removeMember(profileId: string) {
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile || !isCompanyAdmin(profile.role)) errorRedirect('Only owners and admins can remove teammates.')

  const { error } = await supabase.from('profiles').delete().eq('id', profileId)
  if (error) errorRedirect(error.message)

  revalidatePath('/settings')
}
