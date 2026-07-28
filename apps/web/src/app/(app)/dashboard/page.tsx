import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDateYMD } from '@/lib/calendar'
import { formatAuditTimestamp } from '@/lib/audit'
import { formatMoney } from '@/lib/money'
import { getCompanyCurrency } from '@/lib/company'
import { JOB_STATUS_GROUPS } from '@trade-assist/db'
import type { Customer, CostEntry, Invoice, Quote, Job } from '@trade-assist/db'

type DashboardJob = Job & {
  customer: Pick<Customer, 'name'> | null
  cost_entries: Pick<CostEntry, 'total_cost'>[]
  quotes: Pick<Quote, 'status' | 'total' | 'tax_amount' | 'superseded_at'>[]
  invoices: Pick<Invoice, 'status' | 'total' | 'tax_amount' | 'superseded_at' | 'created_at'>[]
}

type AuditRow = {
  id: string
  action: string
  created_at: string
  job: { job_number: string | null } | null
  profile: { full_name: string | null } | null
}

function getGreeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatJobWhen(startDate: string | null, startTime: string | null, today: string): string {
  const datePart = startDate === today ? 'Today' : (startDate ?? '')
  const timePart = startTime ? startTime.slice(0, 5) : null
  return timePart ? `${datePart}, ${timePart}` : datePart
}

function getWeekRange(now: Date): { start: Date; end: Date } {
  const dayOfWeek = now.getDay()
  const diffToMonday = (dayOfWeek + 6) % 7
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday)
  const end = new Date(start)
  end.setDate(start.getDate() + 7)
  return { start, end }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const now = new Date()
  const today = formatDateYMD(now)
  const { start: weekStart, end: weekEnd } = getWeekRange(now)

  const [{ data: profileData }, { currency }, { data: jobsData }, { data: auditData }] = await Promise.all([
    supabase.from('profiles').select('full_name').single(),
    getCompanyCurrency(supabase),
    supabase
      .from('jobs')
      .select(
        '*, customer:customers(name), cost_entries(total_cost), quotes(status, total, tax_amount, superseded_at), invoices(status, total, tax_amount, superseded_at, created_at)'
      ),
    supabase
      .from('job_audit_log')
      .select('id, action, created_at, job:jobs(job_number), profile:profiles(full_name)')
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  const firstName = profileData?.full_name?.split(' ')[0] ?? null
  const jobs = (jobsData ?? []) as unknown as DashboardJob[]
  const activeStatuses = JOB_STATUS_GROUPS.active

  const jobsToday = jobs.filter((j) => j.start_date === today && activeStatuses.includes(j.status)).length

  const quotesAwaiting = jobs.reduce(
    (count, j) => count + j.quotes.filter((q) => q.status === 'sent' && !q.superseded_at).length,
    0
  )

  const invoicesReady = jobs.reduce(
    (count, j) => count + j.invoices.filter((inv) => inv.status === 'draft' && !inv.superseded_at).length,
    0
  )

  const jobsOverBudget = jobs.filter((j) => {
    if (!activeStatuses.includes(j.status)) return false
    const quotedTotal = j.quotes
      .filter((q) => !q.superseded_at)
      .reduce((sum, q) => sum + Number(q.total) + Number(q.tax_amount), 0)
    if (quotedTotal <= 0) return false
    const costsTotal = j.cost_entries.reduce((sum, c) => sum + Number(c.total_cost), 0)
    return costsTotal > quotedTotal
  }).length

  const revenueThisWeek = jobs.reduce((sum, j) => {
    const jobRevenue = j.invoices
      .filter((inv) => {
        if (inv.status !== 'paid' || inv.superseded_at) return false
        const created = new Date(inv.created_at)
        return created >= weekStart && created < weekEnd
      })
      .reduce((invSum, inv) => invSum + Number(inv.total) + Number(inv.tax_amount), 0)
    return sum + jobRevenue
  }, 0)

  const upcomingJobs = jobs
    .filter((j) => activeStatuses.includes(j.status) && j.start_date && j.start_date >= today)
    .sort((a, b) => {
      const dateCompare = (a.start_date ?? '').localeCompare(b.start_date ?? '')
      if (dateCompare !== 0) return dateCompare
      return (a.start_time ?? '').localeCompare(b.start_time ?? '')
    })
    .slice(0, 5)

  const recentActivity = (auditData ?? []) as unknown as AuditRow[]

  const stats = [
    { label: 'Jobs Today', value: jobsToday },
    { label: 'Quotes Awaiting Approval', value: quotesAwaiting },
    { label: 'Invoices Ready to Send', value: invoicesReady },
    { label: 'Jobs Over Budget', value: jobsOverBudget },
  ]

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">
          {getGreeting(now.getHours())}
          {firstName ? `, ${firstName}` : ''}.
        </h1>
        <p className="text-sm text-muted">Today&apos;s snapshot</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-surface-border p-4">
            <p className="text-2xl font-semibold">{stat.value}</p>
            <p className="text-xs text-muted">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-surface-border p-4">
        <p className="text-xs text-muted">Revenue this week</p>
        <p className="text-2xl font-semibold">{formatMoney(revenueThisWeek, currency)}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-surface-border p-4">
          <h2 className="mb-3 text-sm font-medium">Upcoming jobs</h2>
          {upcomingJobs.length === 0 ? (
            <p className="text-sm text-muted">No upcoming jobs scheduled.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {upcomingJobs.map((job) => (
                <li key={job.id}>
                  <Link href={`/jobs/${job.id}`} className="hover:text-accent">
                    <span className="text-muted">{formatJobWhen(job.start_date, job.start_time, today)}</span>
                    {' — '}
                    <span className="font-medium">{job.job_number ?? 'Job'}</span>
                    {' — '}
                    <span>{job.customer?.name ?? 'Customer'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-surface-border p-4">
          <h2 className="mb-3 text-sm font-medium">Recent activity</h2>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted">No activity yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {recentActivity.map((entry) => (
                <li key={entry.id} className="text-xs">
                  <span className="text-muted">{formatAuditTimestamp(entry.created_at)}</span>{' '}
                  {entry.job?.job_number && <span className="font-medium">{entry.job.job_number}</span>}{' '}
                  {entry.profile?.full_name ?? 'System'} — {entry.action}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
