import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { JOB_STATUSES, JOB_STATUS_LABELS, type JobStatus } from '@trade-assist/db'
import type { JobWithCustomer } from '@/lib/jobs'

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  const { status, q } = await searchParams
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('jobs')
    .select('*, customer:customers(id, name)')
    .order('created_at', { ascending: false })

  const jobs = ((data ?? []) as unknown as JobWithCustomer[]).filter((job) => {
    if (status && job.status !== status) return false
    if (q) {
      const needle = q.toLowerCase()
      const haystack = [job.job_number, job.customer?.name, job.address_line, job.notes]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(needle)) return false
    }
    return true
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Jobs</h1>
        <Link
          href="/jobs/new"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          New job
        </Link>
      </div>

      <form className="mb-6 flex flex-wrap gap-3" method="get">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search job number, customer, address..."
          className="min-w-[240px] flex-1 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <select
          name="status"
          defaultValue={status ?? ''}
          className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
        >
          <option value="">All statuses</option>
          {JOB_STATUSES.map((s) => (
            <option key={s} value={s}>
              {JOB_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-surface-border px-4 py-2 text-sm font-medium hover:border-accent"
        >
          Filter
        </button>
      </form>

      {error && <p className="text-sm text-accent">Failed to load jobs: {error.message}</p>}

      {jobs.length === 0 ? (
        <p className="text-sm text-muted">
          {status || q
            ? 'No jobs match your search or filter.'
            : 'No jobs yet. Create your first job to get started.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-surface-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Job #</th>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Start</th>
                <th className="px-4 py-2 font-medium">Finish</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-surface-border hover:bg-surface">
                  <td className="px-4 py-2">
                    <Link href={`/jobs/${job.id}`} className="font-medium text-accent">
                      {job.job_number ?? '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{job.customer?.name ?? '—'}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="px-4 py-2">{job.start_date ?? '—'}</td>
                  <td className="px-4 py-2">{job.finish_date ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className="inline-flex items-center rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium text-foreground">
      {JOB_STATUS_LABELS[status]}
    </span>
  )
}
