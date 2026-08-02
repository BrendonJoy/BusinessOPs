import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/money'
import { formatDate } from '@/lib/dates'
import { JOB_STATUS_LABELS, type JobStatus } from '@trade-assist/db'
import { Badge, SidePanel, Stat, buttonClasses } from '@/components/ui'

/**
 * Intercepted route: clicking a job from the list opens it as a slide-over,
 * while a direct link or a refresh still renders the full job page.
 *
 * `(.)` rather than `(..)` because interception counts route *segments*, and
 * neither the `(app)` route group nor the `@panel` slot is one — so `jobs` sits
 * on the same level as this file.
 *
 * Deliberately a condensed view. The full job page runs to ~700 lines with
 * quote versioning, multiple invoices, a costs table, file uploads and an audit
 * log; squeezed into a drawer that would be worse than the page it replaced.
 * This answers "what is this job, and is it healthy?" — anything that involves
 * editing sends you to the full page.
 */
type PanelJob = {
  id: string
  job_number: string | null
  status: JobStatus
  start_date: string | null
  start_time: string | null
  finish_date: string | null
  finish_time: string | null
  notes: string | null
  address_line: string | null
  customer: { name: string; phone: string | null; email: string | null } | null
  company: { currency: string } | null
  cost_entries: { total_cost: number }[]
  invoices: { total: number; tax_amount: number; superseded_at: string | null }[]
  job_assignments: { profile: { full_name: string | null; email: string; job_title: string | null } | null }[]
}

export default async function JobPanel({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data } = await supabase
    .from('jobs')
    .select(
      'id, job_number, status, start_date, start_time, finish_date, finish_time, notes, address_line, customer:customers(name, phone, email), company:companies(currency), cost_entries(total_cost), invoices(total, tax_amount, superseded_at), job_assignments(profile:profiles(full_name, email, job_title))'
    )
    .eq('id', id)
    .maybeSingle()

  const job = data as unknown as PanelJob | null
  if (!job) notFound()

  const currency = job.company?.currency ?? 'USD'
  const costs = job.cost_entries.reduce((sum, c) => sum + Number(c.total_cost), 0)
  const invoiced = job.invoices
    .filter((inv) => !inv.superseded_at)
    .reduce((sum, inv) => sum + Number(inv.total) + Number(inv.tax_amount), 0)

  const when = (date: string | null, time: string | null) =>
    date ? `${formatDate(date)}${time ? ` ${time.slice(0, 5)}` : ''}` : '—'

  return (
    <SidePanel
      title={job.job_number ?? 'Job'}
      subtitle={job.customer?.name ?? 'No customer'}
      footer={
        // A plain anchor, NOT next/link, and this matters.
        //
        // While the panel is open the URL is already /jobs/[id] — the panel is
        // that route, intercepted. A client-side navigation to the same URL is
        // a no-op, so the button did nothing at all. A full page load bypasses
        // interception (it only applies to soft navigation), which is precisely
        // how we get the real page.
        <a
          href={`/jobs/${job.id}`}
          className={buttonClasses('primary', 'md', 'w-full')}
        >
          Open full job
        </a>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <Badge tone="muted">{JOB_STATUS_LABELS[job.status]}</Badge>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Invoiced" value={formatMoney(invoiced, currency)} />
          <Stat label="Costs" value={formatMoney(costs, currency)} />
          <Stat label="Profit" value={formatMoney(invoiced - costs, currency)} />
        </div>

        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Start</dt>
            <dd className="text-right">{when(job.start_date, job.start_time)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Finish</dt>
            <dd className="text-right">{when(job.finish_date, job.finish_time)}</dd>
          </div>
          {job.address_line && (
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-muted">Address</dt>
              <dd className="text-right">{job.address_line}</dd>
            </div>
          )}
        </dl>

        {job.customer && (job.customer.phone || job.customer.email) && (
          <div>
            <p className="mb-2 text-xs font-semibold text-muted">Customer</p>
            {/* Tappable on a phone — this is the panel's most useful action when
                you're standing outside someone's house. */}
            <div className="flex flex-col gap-1 text-sm">
              {job.customer.phone && (
                <a href={`tel:${job.customer.phone}`} className="text-accent hover:opacity-80">
                  {job.customer.phone}
                </a>
              )}
              {job.customer.email && (
                <a href={`mailto:${job.customer.email}`} className="text-accent hover:opacity-80">
                  {job.customer.email}
                </a>
              )}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold text-muted">Assigned</p>
          {job.job_assignments.length === 0 ? (
            <p className="text-sm text-muted">Unassigned</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {job.job_assignments.map((a, i) => (
                <li
                  key={i}
                  className="rounded-md border border-surface-border bg-surface px-2 py-1 text-sm"
                >
                  {a.profile?.full_name ?? a.profile?.email ?? 'Team member'}
                  {a.profile?.job_title && (
                    <span className="ml-1.5 text-muted">{a.profile.job_title}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {job.notes && (
          <div>
            <p className="mb-2 text-xs font-semibold text-muted">Notes</p>
            <p className="whitespace-pre-wrap text-sm">{job.notes}</p>
          </div>
        )}
      </div>
    </SidePanel>
  )
}
