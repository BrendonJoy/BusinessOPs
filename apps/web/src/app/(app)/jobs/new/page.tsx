import { createClient } from '@/lib/supabase/server'
import { createJob } from './actions'
import NewJobForm from './NewJobForm'

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const supabase = await createClient()
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, email, phone, address')
    .order('name')

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-xl font-semibold">New job</h1>

      {error && (
        <p className="mb-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
      )}

      <NewJobForm createJob={createJob} customers={customers ?? []} />
    </div>
  )
}
