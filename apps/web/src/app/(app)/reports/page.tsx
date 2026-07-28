import { createClient } from '@/lib/supabase/server'
import { formatDateYMD, getMonthInfo } from '@/lib/calendar'
import { formatMoney } from '@/lib/money'
import { getCompanyCurrency } from '@/lib/company'
import type { Customer, CostEntry, Invoice, Job } from '@trade-assist/db'

type ReportJob = Job & {
  customer: Pick<Customer, 'name'> | null
  cost_entries: CostEntry[]
  invoices: Pick<Invoice, 'status' | 'total' | 'tax_amount' | 'superseded_at'>[]
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { from: fromParam, to: toParam } = await searchParams
  const from = fromParam || getMonthInfo().start
  const to = toParam || formatDateYMD(new Date())

  const supabase = await createClient()
  const { currency } = await getCompanyCurrency(supabase)
  const { data } = await supabase
    .from('jobs')
    .select('*, customer:customers(name), cost_entries(*), invoices(status, total, tax_amount, superseded_at)')
    .gte('start_date', from)
    .lte('start_date', to)
    .order('start_date', { ascending: true })

  const jobs = (data ?? []) as unknown as ReportJob[]

  const rows = jobs.map((job) => {
    const costsTotal = job.cost_entries.reduce((sum, c) => sum + Number(c.total_cost), 0)
    const invoicedTotal = job.invoices
      .filter((inv) => !inv.superseded_at)
      .reduce((sum, inv) => sum + Number(inv.total) + Number(inv.tax_amount), 0)
    return { job, costsTotal, invoicedTotal, profit: invoicedTotal - costsTotal }
  })

  const totals = rows.reduce(
    (acc, r) => ({
      invoiced: acc.invoiced + r.invoicedTotal,
      costs: acc.costs + r.costsTotal,
      profit: acc.profit + r.profit,
    }),
    { invoiced: 0, costs: 0, profit: 0 }
  )

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Reports</h1>

      <form className="mb-6 flex flex-wrap items-end gap-3" method="get">
        <div className="flex flex-col gap-1">
          <label htmlFor="from" className="text-xs font-medium">
            From
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={from}
            className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="to" className="text-xs font-medium">
            To
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={to}
            className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-surface-border px-4 py-2 text-sm font-medium hover:border-accent"
        >
          Filter
        </button>
      </form>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-surface-border p-4">
          <p className="text-xs text-muted">Total invoiced</p>
          <p className="text-lg font-semibold">{formatMoney(totals.invoiced, currency)}</p>
        </div>
        <div className="rounded-lg border border-surface-border p-4">
          <p className="text-xs text-muted">Total costs</p>
          <p className="text-lg font-semibold">{formatMoney(totals.costs, currency)}</p>
        </div>
        <div className="rounded-lg border border-surface-border p-4">
          <p className="text-xs text-muted">Total profit</p>
          <p className="text-lg font-semibold">{formatMoney(totals.profit, currency)}</p>
        </div>
        <div className="rounded-lg border border-surface-border p-4">
          <p className="text-xs text-muted">Jobs</p>
          <p className="text-lg font-semibold">{rows.length}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">No jobs with a start date in this range.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-surface-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Job #</th>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Invoiced</th>
                <th className="px-4 py-2 font-medium">Costs</th>
                <th className="px-4 py-2 font-medium">Profit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ job, costsTotal, invoicedTotal, profit }) => (
                <tr key={job.id} className="border-t border-surface-border">
                  <td className="px-4 py-2 font-medium">{job.job_number ?? '—'}</td>
                  <td className="px-4 py-2">{job.customer?.name ?? '—'}</td>
                  <td className="px-4 py-2 capitalize">{job.status.replace('_', ' ')}</td>
                  <td className="px-4 py-2">{formatMoney(invoicedTotal, currency)}</td>
                  <td className="px-4 py-2">{formatMoney(costsTotal, currency)}</td>
                  <td className="px-4 py-2">{formatMoney(profit, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
