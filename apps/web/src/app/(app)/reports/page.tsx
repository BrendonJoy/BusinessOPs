import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDateYMD, getMonthInfo } from '@/lib/calendar'
import { formatMoney } from '@/lib/money'
import { getCompanyCurrency, getCompanyModules } from '@/lib/company'
import { companyHasStaffFeatures } from '@/lib/entitlements'
import { getCurrentProfile, canViewReports, isCompanyAccount } from '@/lib/roles'
import type { Customer, CostEntry, Invoice, Job } from '@trade-assist/db'
import {
  Button,
  DataTable,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Stat,
  type Column,
} from '@/components/ui'

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
  const profile = await getCurrentProfile(supabase)
  const { modules_reports_enabled } = await getCompanyModules(supabase)
  const staffFeatures = await companyHasStaffFeatures(supabase)
  if (!modules_reports_enabled || !canViewReports(profile)) redirect('/jobs')

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

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: 'job_number',
      header: 'Job #',
      mobile: 'title',
      className: 'font-medium',
      cell: (r) => r.job.job_number ?? '—',
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'meta',
      className: 'capitalize',
      cell: (r) => <span className="capitalize">{r.job.status.replace('_', ' ')}</span>,
    },
    { key: 'customer', header: 'Customer', cell: (r) => r.job.customer?.name ?? '—' },
    {
      key: 'invoiced',
      header: 'Invoiced',
      cell: (r) => formatMoney(r.invoicedTotal, currency),
    },
    { key: 'costs', header: 'Costs', cell: (r) => formatMoney(r.costsTotal, currency) },
    { key: 'profit', header: 'Profit', cell: (r) => formatMoney(r.profit, currency) },
  ]

  return (
    <div>
      <PageHeader
        title="Reports"
        actions={
          isCompanyAccount(profile?.role) &&
          staffFeatures && (
            <>
              <Link href="/reports/staff" className="text-sm text-accent hover:opacity-80">
                View staff timesheets →
              </Link>
              <Link href="/timesheet/payroll" className="text-sm text-accent hover:opacity-80">
                Payroll →
              </Link>
            </>
          )
        }
      />

      <form className="mb-6 flex flex-wrap items-end gap-3" method="get">
        <Field label="From" htmlFor="from">
          <Input id="from" name="from" type="date" defaultValue={from} fullWidth={false} />
        </Field>
        <Field label="To" htmlFor="to">
          <Input id="to" name="to" type="date" defaultValue={to} fullWidth={false} />
        </Field>
        <Button type="submit">Filter</Button>
      </form>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total invoiced" value={formatMoney(totals.invoiced, currency)} />
        <Stat label="Total costs" value={formatMoney(totals.costs, currency)} />
        <Stat label="Total profit" value={formatMoney(totals.profit, currency)} />
        <Stat label="Jobs" value={rows.length} />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.job.id}
        getRowHref={(r) => `/jobs/${r.job.id}`}
        empty={<EmptyState title="No jobs with a start date in this range." />}
      />
    </div>
  )
}
