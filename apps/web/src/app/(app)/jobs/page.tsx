import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { JOB_STATUS_GROUPS, JOB_STATUS_LABELS, type JobStatus } from '@trade-assist/db'
import type { JobWithCustomer } from '@/lib/jobs'
import { formatDate } from '@/lib/dates'
import {
  Badge,
  ButtonLink,
  DataTable,
  EmptyState,
  Notice,
  PageHeader,
  type Column,
} from '@/components/ui'
import JobsToolbar from './JobsToolbar'

const VIEWS = ['active', 'completed', 'cancelled'] as const
type View = (typeof VIEWS)[number]

const VIEW_LABELS: Record<View, string> = {
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const SORT_COLUMNS = ['job_number', 'customer', 'status', 'start_date', 'finish_date'] as const
type SortColumn = (typeof SORT_COLUMNS)[number]

const COLUMN_LABELS: Record<SortColumn, string> = {
  job_number: 'Job #',
  customer: 'Customer',
  status: 'Status',
  start_date: 'Start',
  finish_date: 'Finish',
}

function sortValue(job: JobWithCustomer, column: SortColumn): string | null {
  switch (column) {
    case 'job_number':
      return job.job_number
    case 'customer':
      return job.customer?.name ?? null
    case 'status':
      return JOB_STATUS_LABELS[job.status]
    case 'start_date':
      return job.start_date
    case 'finish_date':
      return job.finish_date
  }
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; view?: string; sort?: string; dir?: string }>
}) {
  const { status, q, view: viewParam, sort: sortParam, dir: dirParam } = await searchParams
  const view: View = VIEWS.includes(viewParam as View) ? (viewParam as View) : 'active'
  const sort: SortColumn = SORT_COLUMNS.includes(sortParam as SortColumn)
    ? (sortParam as SortColumn)
    : 'start_date'
  const dir: 'asc' | 'desc' = dirParam === 'desc' ? 'desc' : 'asc'

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('jobs')
    .select('*, customer:customers(id, name)')
    .order('created_at', { ascending: false })

  const groupStatuses = JOB_STATUS_GROUPS[view]

  const jobs = ((data ?? []) as unknown as JobWithCustomer[]).filter((job) => {
    if (!groupStatuses.includes(job.status)) return false
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

  // Jobs without a value in the sorted column always sink to the bottom.
  jobs.sort((a, b) => {
    const aVal = sortValue(a, sort)
    const bVal = sortValue(b, sort)
    if (aVal === null && bVal === null) return 0
    if (aVal === null) return 1
    if (bVal === null) return -1
    const compare = aVal.localeCompare(bVal)
    return dir === 'asc' ? compare : -compare
  })

  function headerHref(column: SortColumn): string {
    const query = new URLSearchParams()
    query.set('view', view)
    if (q) query.set('q', q)
    if (status) query.set('status', status)
    query.set('sort', column)
    query.set('dir', column === sort && dir === 'asc' ? 'desc' : 'asc')
    return `/jobs?${query.toString()}`
  }

  function sortHeader(column: SortColumn) {
    return (
      <Link href={headerHref(column)} className="hover:text-foreground">
        {COLUMN_LABELS[column]}
        {column === sort && <span className="ml-1">{dir === 'asc' ? '↑' : '↓'}</span>}
      </Link>
    )
  }

  const columns: Column<JobWithCustomer>[] = [
    {
      key: 'job_number',
      header: sortHeader('job_number'),
      mobile: 'title',
      cell: (job) => (
        <Link href={`/jobs/${job.id}`} className="font-medium text-accent">
          {job.job_number ?? '—'}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: sortHeader('customer'),
      mobileLabel: COLUMN_LABELS.customer,
      cell: (job) => job.customer?.name ?? '—',
    },
    {
      key: 'status',
      header: sortHeader('status'),
      mobile: 'meta',
      cell: (job) => <StatusBadge status={job.status} />,
    },
    {
      key: 'start_date',
      header: sortHeader('start_date'),
      mobileLabel: COLUMN_LABELS.start_date,
      cell: (job) => formatDate(job.start_date),
    },
    {
      key: 'finish_date',
      header: sortHeader('finish_date'),
      mobileLabel: COLUMN_LABELS.finish_date,
      cell: (job) => formatDate(job.finish_date),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Jobs"
        actions={
          <ButtonLink href="/jobs/new" variant="primary">
            New job
          </ButtonLink>
        }
      />

      <div className="mb-6 flex gap-4 border-b border-surface-border text-sm">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={`/jobs?view=${v}`}
            className={`border-b-2 px-1 pb-2 font-medium ${
              v === view ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            {VIEW_LABELS[v]}
          </Link>
        ))}
      </div>

      <JobsToolbar
        view={view}
        q={q ?? ''}
        status={status ?? ''}
        sort={sortParam ?? ''}
        dir={dirParam ?? ''}
        statusOptions={
          view === 'active'
            ? groupStatuses.map((s) => ({ value: s, label: JOB_STATUS_LABELS[s] }))
            : []
        }
      />

      {error && <Notice tone="error">Failed to load jobs: {error.message}</Notice>}

      <DataTable
        columns={columns}
        rows={jobs}
        getRowKey={(job) => job.id}
        getRowHref={(job) => `/jobs/${job.id}`}
        empty={
          <EmptyState
            title={
              status || q
                ? 'No jobs match your search or filter.'
                : `No ${VIEW_LABELS[view].toLowerCase()} jobs.`
            }
            action={
              status || q ? undefined : (
                <ButtonLink href="/jobs/new" variant="primary">
                  New job
                </ButtonLink>
              )
            }
          />
        }
      />
    </div>
  )
}

function StatusBadge({ status }: { status: JobStatus }) {
  return <Badge tone="muted">{JOB_STATUS_LABELS[status]}</Badge>
}
