import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'
import { getCompanyCurrency, getCompanyModules, getTimesheetSettings } from '@/lib/company'
import { getPayrollReport, listRecentCycles } from '@/lib/payroll'
import { formatMoney } from '@/lib/money'
import { PAY_CYCLE_LENGTH_LABELS } from '@trade-assist/db'
import { approvePayrollPeriod } from '../approval-actions'

function localYMD(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; error?: string }>
}) {
  const { from: fromParam, to: toParam, error } = await searchParams
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  const { modules_timesheets_enabled } = await getCompanyModules(supabase)
  if (!modules_timesheets_enabled || !isCompanyAccount(profile?.role)) redirect('/timesheet')

  const settings = await getTimesheetSettings(supabase)
  const { currency } = await getCompanyCurrency(supabase)

  const today = localYMD(new Date())
  const cycles = listRecentCycles(settings.pay_cycle_length, settings.pay_cycle_anchor, today, 6)

  const from = fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : cycles[0].start
  const to = toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam) ? toParam : cycles[0].end
  const isCurrentCycle = from <= today && today <= to

  const [staffRows, { data: periodData }] = await Promise.all([
    getPayrollReport(supabase, from, to),
    supabase.from('payroll_periods').select('approved_at').eq('period_start', from).maybeSingle(),
  ])

  const approvedAt = periodData?.approved_at as string | undefined
  const totalUnsubmitted = staffRows.reduce((sum, s) => sum + s.unsubmittedCount, 0)
  const totalUnapproved = staffRows.reduce((sum, s) => sum + s.unapprovedCount, 0)
  const grandHours = staffRows.reduce((sum, s) => sum + s.totalHours, 0)
  const grandPay = staffRows.reduce((sum, s) => sum + (s.totalPay ?? 0), 0)

  const exportQuery = `from=${from}&to=${to}`

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Payroll</h1>
        <Link href="/timesheet" className="text-sm text-accent hover:opacity-80">
          ← Back to Timesheet
        </Link>
      </div>

      {error && <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">
          {PAY_CYCLE_LENGTH_LABELS[settings.pay_cycle_length]} cycles
          {!settings.pay_cycle_anchor && ' (starting Monday — set an anchor date in Settings to change)'}:
        </span>
        {cycles.map((cycle) => {
          const active = cycle.start === from
          return (
            <Link
              key={cycle.start}
              href={`/timesheet/payroll?from=${cycle.start}&to=${cycle.end}`}
              className={`rounded-full border px-3 py-1 text-xs ${
                active ? 'border-accent bg-accent text-accent-foreground' : 'border-surface-border hover:border-accent'
              }`}
            >
              {formatDate(cycle.start)} – {formatDate(cycle.end)}
            </Link>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-border p-4">
        <div className="text-sm">
          <p className="font-medium">
            {formatDate(from)} – {formatDate(to)}
            {isCurrentCycle && <span className="ml-2 text-xs text-muted">(cycle in progress)</span>}
          </p>
          <p className="text-muted">
            {approvedAt
              ? `Approved ${new Date(approvedAt).toLocaleDateString()}`
              : 'Not yet approved'}
            {totalUnsubmitted > 0 && ` · ${totalUnsubmitted} entr${totalUnsubmitted === 1 ? 'y' : 'ies'} not submitted`}
            {totalUnapproved > 0 && ` · ${totalUnapproved} entr${totalUnapproved === 1 ? 'y' : 'ies'} awaiting day approval`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/payroll/csv?${exportQuery}`}
            className="rounded-md border border-surface-border px-3 py-1.5 text-xs font-medium hover:border-accent"
          >
            Download CSV
          </a>
          <a
            href={`/api/payroll/pdf?${exportQuery}`}
            className="rounded-md border border-surface-border px-3 py-1.5 text-xs font-medium hover:border-accent"
          >
            Download PDF
          </a>
          {!approvedAt && (
            <form action={approvePayrollPeriod}>
              <input type="hidden" name="period_start" value={from} />
              <input type="hidden" name="period_end" value={to} />
              <button
                type="submit"
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90"
              >
                Approve period
              </button>
            </form>
          )}
        </div>
      </div>

      {staffRows.length === 0 ? (
        <p className="text-sm text-muted">No timesheet entries in this period.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="overflow-x-auto rounded-lg border border-surface-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Staff</th>
                  <th className="px-4 py-2 font-medium">Hours</th>
                  <th className="px-4 py-2 font-medium">Rate</th>
                  <th className="px-4 py-2 font-medium">Pay</th>
                </tr>
              </thead>
              <tbody>
                {staffRows.map((staff) => (
                  <tr key={staff.profileId} className="border-t border-surface-border">
                    <td className="px-4 py-2 font-medium">{staff.staffName}</td>
                    <td className="px-4 py-2">{staff.totalHours.toFixed(2)}</td>
                    <td className="px-4 py-2">{staff.rate !== null ? formatMoney(staff.rate, currency) : '—'}</td>
                    <td className="px-4 py-2">{staff.totalPay !== null ? formatMoney(staff.totalPay, currency) : '—'}</td>
                  </tr>
                ))}
                <tr className="border-t border-surface-border bg-surface font-medium">
                  <td className="px-4 py-2">Total</td>
                  <td className="px-4 py-2">{grandHours.toFixed(2)}</td>
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2">{formatMoney(grandPay, currency)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {staffRows.map((staff) => (
            <section key={staff.profileId} className="rounded-lg border border-surface-border p-4">
              <h2 className="mb-3 text-sm font-medium">{staff.staffName}</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {staff.entries.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {formatDate(entry.workDate)} — {entry.target}
                    </span>
                    <span className="text-muted">
                      {formatTime(entry.clockIn)}
                      {entry.clockOut ? ` – ${formatTime(entry.clockOut)}` : ' (open)'}
                      {' · '}
                      {entry.hours.toFixed(2)}h
                      {entry.dayStatus !== 'approved' && (
                        <span className="ml-2 text-xs text-accent">
                          {entry.dayStatus === 'submitted' ? 'awaiting approval' : 'not submitted'}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
