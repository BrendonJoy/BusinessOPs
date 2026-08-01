import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { JOB_STATUS_LABELS } from '@trade-assist/db'
import type { Customer, Job } from '@trade-assist/db'
import { formatDate } from '@/lib/dates'
import { Button, Card, EmptyState, Field, Input, Notice, Textarea } from '@/components/ui'
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

      {error && <Notice tone="error">{error}</Notice>}

      <Card>
        <h2 className="mb-4 text-sm font-medium">Details</h2>
        <form action={boundUpdate} className="flex flex-col gap-4">
          <Field label="Name" htmlFor="name" required>
            <Input id="name" name="name" type="text" required defaultValue={customer.name} />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" defaultValue={customer.email ?? ''} />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" type="tel" defaultValue={customer.phone ?? ''} />
          </Field>
          <Field label="Address" htmlFor="address">
            <Textarea id="address" name="address" rows={2} defaultValue={customer.address ?? ''} />
          </Field>
          <Field label="Notes" htmlFor="notes">
            <Textarea id="notes" name="notes" rows={3} defaultValue={customer.notes ?? ''} />
          </Field>
          <Button type="submit" variant="primary" className="w-full sm:w-auto sm:self-start">
            Save customer
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-medium">Jobs ({jobs.length})</h2>
        {jobs.length === 0 ? (
          <EmptyState title="No jobs for this customer yet." />
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link
                  href={`/jobs/${job.id}`}
                  className="block rounded-md px-2 py-2.5 hover:bg-surface hover:text-accent sm:py-1"
                >
                  <span className="font-medium">{job.job_number ?? 'Job'}</span>
                  {' — '}
                  <span>{JOB_STATUS_LABELS[job.status]}</span>
                  {job.start_date && (
                    <span className="text-muted"> — {formatDate(job.start_date)}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
