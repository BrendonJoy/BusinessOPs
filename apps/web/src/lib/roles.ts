import type { createClient } from '@/lib/supabase/server'
import type { Profile } from '@trade-assist/db'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export async function getCurrentProfile(supabase: SupabaseClient): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  return (data as Profile | null) ?? null
}

export function isCompanyAdmin(role: Profile['role'] | undefined): boolean {
  return role === 'owner' || role === 'admin'
}
