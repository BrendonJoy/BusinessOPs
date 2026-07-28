'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getBaseUrl } from '@/lib/url'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'
import { sendTeamInviteEmail } from '@/lib/email'
import type { AccessLevel } from '@trade-assist/db'

function errorRedirect(message: string): never {
  redirect(`/settings?error=${encodeURIComponent(message)}`)
}

function extractPermissions(formData: FormData) {
  const quotesAccess = String(formData.get('quotes_access') ?? 'hidden')
  const invoicesAccess = String(formData.get('invoices_access') ?? 'hidden')

  if (!['hidden', 'view', 'full'].includes(quotesAccess)) errorRedirect('Invalid quotes access level.')
  if (!['hidden', 'view', 'full'].includes(invoicesAccess)) errorRedirect('Invalid invoices access level.')

  return {
    can_view_all_jobs: formData.get('can_view_all_jobs') === 'on',
    can_edit_jobs: formData.get('can_edit_jobs') === 'on',
    quotes_access: quotesAccess as AccessLevel,
    invoices_access: invoicesAccess as AccessLevel,
    can_log_expenses: formData.get('can_log_expenses') === 'on',
    can_view_reports: formData.get('can_view_reports') === 'on',
    can_schedule: formData.get('can_schedule') === 'on',
  }
}

function parsePayRate(formData: FormData): number | null {
  const raw = String(formData.get('pay_rate') ?? '').trim()
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

export async function inviteTeamMember(formData: FormData) {
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile || !isCompanyAccount(profile.role)) errorRedirect('Only the company account can invite teammates.')

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email) errorRedirect('Enter an email address.')

  const { data: company } = await supabase.from('companies').select('name').eq('id', profile.company_id).single()

  const { data: invite, error } = await supabase
    .from('company_invites')
    .insert({ company_id: profile.company_id, email, invited_by: profile.id })
    .select('token')
    .single()

  if (error) errorRedirect(error.message)

  const baseUrl = await getBaseUrl()
  const result = await sendTeamInviteEmail({
    to: email,
    companyName: company?.name ?? 'BusinessOps',
    role: 'staff',
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
  if (!profile || !isCompanyAccount(profile.role)) errorRedirect('Only the company account can revoke invites.')

  const { error } = await supabase.from('company_invites').delete().eq('id', inviteId)
  if (error) errorRedirect(error.message)

  revalidatePath('/settings')
}

export async function updateMemberPermissions(profileId: string, formData: FormData) {
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile || !isCompanyAccount(profile.role)) errorRedirect('Only the company account can change permissions.')

  const { error } = await supabase.from('profiles').update(extractPermissions(formData)).eq('id', profileId)
  if (error) errorRedirect(error.message)

  const payRate = parsePayRate(formData)
  if (payRate === null) {
    await supabase.from('staff_pay_rates').delete().eq('profile_id', profileId)
  } else {
    await supabase.from('staff_pay_rates').upsert({ profile_id: profileId, pay_rate: payRate })
  }

  revalidatePath('/settings')
}

export async function updateInvitePermissions(inviteId: string, formData: FormData) {
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile || !isCompanyAccount(profile.role)) errorRedirect('Only the company account can change permissions.')

  const { error } = await supabase
    .from('company_invites')
    .update({ ...extractPermissions(formData), pay_rate: parsePayRate(formData) })
    .eq('id', inviteId)
  if (error) errorRedirect(error.message)

  revalidatePath('/settings')
}

export async function removeMember(profileId: string) {
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile || !isCompanyAccount(profile.role)) errorRedirect('Only the company account can remove teammates.')

  const { error } = await supabase.from('profiles').delete().eq('id', profileId)
  if (error) errorRedirect(error.message)

  revalidatePath('/settings')
}
