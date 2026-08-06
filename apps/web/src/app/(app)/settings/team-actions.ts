'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getBaseUrl } from '@/lib/url'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'
import { companyHasStaffFeatures } from '@/lib/entitlements'
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

type PayDetails = { pay_type: 'hourly' | 'salaried'; pay_rate: number | null }

/**
 * Returns null for "not set up yet", which is a genuinely different state from
 * salaried — the latter is a decision, the former is an outstanding task. Both
 * produce no labour cost on clock-out, which is exactly why they need telling
 * apart in the data.
 */
function parsePay(formData: FormData): PayDetails | null {
  if (String(formData.get('pay_type') ?? '') === 'salaried') {
    return { pay_type: 'salaried', pay_rate: null }
  }

  const raw = String(formData.get('pay_rate') ?? '').trim()
  if (!raw) return null

  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) return null

  return { pay_type: 'hourly', pay_rate: value }
}

/**
 * Employment details, kept separate from extractPermissions because they are a
 * different kind of thing: a job title has no effect on what anyone can access.
 */
function extractEmployment(formData: FormData) {
  const jobTitle = String(formData.get('job_title') ?? '').trim()
  return { job_title: jobTitle || null }
}

export async function inviteTeamMember(formData: FormData) {
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile || !isCompanyAccount(profile.role)) errorRedirect('Only the company account can invite teammates.')

  // Hiding the form is not the control. On the Individual tier there is nobody
  // to invite — but note this blocks *new* invites only: anyone already in the
  // account keeps working. Locking existing staff out of an account they are
  // rostered on would be a far worse failure than an over-generous plan.
  if (!(await companyHasStaffFeatures(supabase))) {
    errorRedirect('Inviting teammates needs the Company plan.')
  }

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email) errorRedirect('Enter an email address.')

  const { data: company } = await supabase.from('companies').select('name').eq('id', profile.company_id).single()

  const { data: invite, error } = await supabase
    .from('company_invites')
    .insert({
      company_id: profile.company_id,
      email,
      invited_by: profile.id,
      ...extractEmployment(formData),
    })
    .select('token')
    .single()

  if (error) errorRedirect(error.message)

  const baseUrl = await getBaseUrl()
  const result = await sendTeamInviteEmail({
    to: email,
    companyName: company?.name ?? 'BusinessOps',
    role: 'staff',
    inviteUrl: `${baseUrl}/accept-invite/${invite!.token}`,
    replyTo: profile.email ?? undefined,
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

  const { error } = await supabase
    .from('profiles')
    .update({ ...extractPermissions(formData), ...extractEmployment(formData) })
    .eq('id', profileId)
  if (error) errorRedirect(error.message)

  const pay = parsePay(formData)
  if (pay === null) {
    await supabase.from('staff_pay_rates').delete().eq('profile_id', profileId)
  } else {
    await supabase.from('staff_pay_rates').upsert({ profile_id: profileId, ...pay })
  }

  revalidatePath('/settings')
}

export async function updateInvitePermissions(inviteId: string, formData: FormData) {
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile || !isCompanyAccount(profile.role)) errorRedirect('Only the company account can change permissions.')

  const { error } = await supabase
    .from('company_invites')
    .update({
      ...extractPermissions(formData),
      ...extractEmployment(formData),
      // Written as an explicit pair so switching an invite from hourly to
      // salaried clears the rate rather than leaving a stale one behind for
      // handle_new_user to pick up when the invite is accepted.
      pay_type: parsePay(formData)?.pay_type ?? null,
      pay_rate: parsePay(formData)?.pay_rate ?? null,
    })
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
