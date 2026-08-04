'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'

function errorRedirect(message: string): never {
  redirect(`/settings?error=${encodeURIComponent(message)}`)
}

/**
 * Departments are set up by the company account only. Managers roster within
 * their department; they do not decide who is in it, or appoint other managers.
 *
 * RLS enforces the same rule (migration 0034), so these checks are a courtesy
 * that produces a readable message rather than the boundary itself.
 */
async function requireCompany() {
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile || !isCompanyAccount(profile.role)) {
    errorRedirect('Only the company account can change departments.')
  }
  return { supabase, profile }
}

export async function createTeam(formData: FormData) {
  const { supabase, profile } = await requireCompany()

  const name = String(formData.get('name') ?? '').trim()
  if (!name) errorRedirect('Give the department a name.')

  const { error } = await supabase
    .from('teams')
    .insert({ company_id: profile.company_id, name })

  if (error) errorRedirect(error.message)

  revalidatePath('/settings')
}

export async function renameTeam(teamId: string, formData: FormData) {
  const { supabase } = await requireCompany()

  const name = String(formData.get('name') ?? '').trim()
  if (!name) errorRedirect('Give the department a name.')

  const { error } = await supabase.from('teams').update({ name }).eq('id', teamId)
  if (error) errorRedirect(error.message)

  revalidatePath('/settings')
}

export async function deleteTeam(teamId: string) {
  const { supabase } = await requireCompany()

  // Shifts cascade from the department, so this can throw away a roster.
  // Refuse while any exist rather than silently deleting them — an empty
  // department is easy to remove, and a mistake here is not recoverable.
  const { count } = await supabase
    .from('shifts')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId)

  if ((count ?? 0) > 0) {
    errorRedirect(
      `That department still has ${count} shift${count === 1 ? '' : 's'}. Delete or move them first.`
    )
  }

  const { error } = await supabase.from('teams').delete().eq('id', teamId)
  if (error) errorRedirect(error.message)

  revalidatePath('/settings')
}

export async function addTeamMember(teamId: string, formData: FormData) {
  const { supabase } = await requireCompany()

  const profileId = String(formData.get('profile_id') ?? '')
  const role = String(formData.get('role') ?? 'staff')

  if (!profileId) errorRedirect('Choose someone to add.')
  if (role !== 'manager' && role !== 'staff') errorRedirect('Choose a valid role.')

  const { error } = await supabase
    .from('team_memberships')
    .upsert({ team_id: teamId, profile_id: profileId, role })

  if (error) errorRedirect(error.message)

  revalidatePath('/settings')
}

export async function updateTeamMemberRole(teamId: string, profileId: string, formData: FormData) {
  const { supabase } = await requireCompany()

  const role = String(formData.get('role') ?? 'staff')
  if (role !== 'manager' && role !== 'staff') errorRedirect('Choose a valid role.')

  const { error } = await supabase
    .from('team_memberships')
    .update({ role })
    .eq('team_id', teamId)
    .eq('profile_id', profileId)

  if (error) errorRedirect(error.message)

  revalidatePath('/settings')
}

export async function removeTeamMember(teamId: string, profileId: string) {
  const { supabase } = await requireCompany()

  const { error } = await supabase
    .from('team_memberships')
    .delete()
    .eq('team_id', teamId)
    .eq('profile_id', profileId)

  if (error) errorRedirect(error.message)

  revalidatePath('/settings')
}
