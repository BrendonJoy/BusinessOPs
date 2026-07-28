import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'
import { createJob } from './actions'
import NewJobForm from './NewJobForm'

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)

  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, email, phone, address')
    .order('name')

  let teamOptions: { id: string; full_name: string | null; email: string }[] = []
  if (profile && (isCompanyAccount(profile.role) || profile.can_schedule)) {
    const { data: team } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('company_id', profile.company_id)
      .order('full_name')
    teamOptions = team ?? []
  }

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-xl font-semibold">New job</h1>

      {error && (
        <p className="mb-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
      )}

      <NewJobForm createJob={createJob} customers={customers ?? []} teamOptions={teamOptions} />
    </div>
  )
}
