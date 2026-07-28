import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { JOB_STATUS_LABELS } from '@trade-assist/db'
import type { Customer, Job } from '@trade-assist/db'
import { updateCustomer } from '../actions'

type JobSummary = Pick<Job, 'id' | 'job_number' | 'status' | 'start_date'>

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error } = await searchParams
  const supabase = await createClient()

  const { data } = await supabase.from('customers').select('*').eq('id', id).maybeSingle()
  const customer = data as Customer | null
  if (!customer) notFound()

  const { data: jobsData } = await supabase
    .from('jobs')
    .select('id, job_number, status, start_date')
    .eq('customer_id', id)
    .order('created_at', { ascending: false })

  const jobs = (jobsData ?? []) as JobSummary[]
  const boundUpdate = updateCustomer.bind(null, customer.id)

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <div>
        <Link href="/customers" className="text-sm text-accent hover:opacity-80">
          ← Back to customers
        </Link>
        <h1 className="mt-2 text-xl font-semibold">{customer.name}</h1>
      </div>

      {error && <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>}

      <section className="rounded-lg border border-surface-border p-4">
        <h2 className="mb-4 text-sm font-medium">Details</h2>
        <form action={boundUpdate} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-sm font-medium">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={customer.name}
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={customer.email ?? ''}
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="phone" className="text-sm font-medium">
              Phone
            </label>
            <input
              id="phone"
              name="phone"
              type="text"
              defaultValue={customer.phone ?? ''}
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="address" className="text-sm font-medium">
              Address
            </label>
            <textarea
              id="address"
              name="address"
              rows={2}
              defaultValue={customer.address ?? ''}
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="notes" className="text-sm font-medium">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={customer.notes ?? ''}
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            Save customer
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-surface-border p-4">
        <h2 className="mb-4 text-sm font-medium">Jobs ({jobs.length})</h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted">No jobs for this customer yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link href={`/jobs/${job.id}`} className="hover:text-accent">
                  <span className="font-medium">{job.job_number ?? 'Job'}</span>
                  {' — '}
                  <span>{JOB_STATUS_LABELS[job.status]}</span>
                  {job.start_date && <span className="text-muted"> — {job.start_date}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
