import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDateYMD, getMonthInfo } from '@/lib/calendar'
import { getCompanyModules } from '@/lib/company'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'
import type { TimesheetMiscCategory } from '@trade-assist/db'

type EntryRow = {
  id: string
  profile_id: string
  job_id: string | null
  misc_category: TimesheetMiscCategory | null
  clock_in: string
  clock_out: string | null
  profile: { full_name: string | null; email: string } | null
  job: {
    job_number: string | null
    start_date: string | null
    start_time: string | null
    finish_date: string | null
    finish_time: string | null
  } | null
}

function combineDateTime(date: string | null, time: string | null): Date | null {
  if (!date || !time) return null
  return new Date(`${date}T${time}`)
}

export default async function StaffTimesheetReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { from: fromParam, to: toParam } = await searchParams
  const from = fromParam || getMonthInfo().start
  const to = toParam || formatDateYMD(new Date())

  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  const { modules_timesheets_enabled } = await getCompanyModules(supabase)
  if (!modules_timesheets_enabled || !isCompanyAccount(profile?.role)) redirect('/jobs')

  const { data } = await supabase
    .from('timesheet_entries')
    .select(
      'id, profile_id, job_id, misc_category, clock_in, clock_out, profile:profiles(full_name, email), job:jobs(job_number, start_date, start_time, finish_date, finish_time)'
    )
    .gte('clock_in', `${from}T00:00:00`)
    .lte('clock_in', `${to}T23:59:59`)
    .order('clock_in', { ascending: false })

  const entries = (data ?? []) as unknown as EntryRow[]

  const perEntry = entries.map((entry) => {
    const scheduledStart = entry.job ? combineDateTime(entry.job.start_date, entry.job.start_time) : null
    const scheduledFinish = entry.job ? combineDateTime(entry.job.finish_date, entry.job.finish_time) : null

    const lateMinutes =
      scheduledStart && new Date(entry.clock_in) > scheduledStart
        ? Math.round((new Date(entry.clock_in).getTime() - scheduledStart.getTime()) / 60000)
        : 0

    const overMinutes =
      scheduledFinish && entry.clock_out && new Date(entry.clock_out) > scheduledFinish
        ? Math.round((new Date(entry.clock_out).getTime() - scheduledFinish.getTime()) / 60000)
        : 0

    const hours = entry.clock_out
      ? (new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 3600000
      : 0

    return { entry, lateMinutes, overMinutes, hours }
  })

  const byStaff = new Map<
    string,
    {
      name: string
      totalHours: number
      lateCount: number
      lateMinutes: number
      overCount: number
      overMinutes: number
    }
  >()

  for (const { entry, lateMinutes, overMinutes, hours } of perEntry) {
    const key = entry.profile_id
    const existing = byStaff.get(key) ?? {
      name: entry.profile?.full_name ?? entry.profile?.email ?? 'Unknown',
      totalHours: 0,
      lateCount: 0,
      lateMinutes: 0,
      overCount: 0,
      overMinutes: 0,
    }
    existing.totalHours += hours
    if (lateMinutes > 0) {
      existing.lateCount += 1
      existing.lateMinutes += lateMinutes
    }
    if (overMinutes > 0) {
      existing.overCount += 1
      existing.overMinutes += overMinutes
    }
    byStaff.set(key, existing)
  }

  const staffRows = Array.from(byStaff.values()).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Staff timesheets</h1>
        <Link href="/reports" className="text-sm text-accent hover:opacity-80">
          ← Back to Reports
        </Link>
      </div>

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

      {staffRows.length === 0 ? (
        <p className="text-sm text-muted">No timesheet entries in this range.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-surface-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Staff</th>
                <th className="px-4 py-2 font-medium">Total hours</th>
                <th className="px-4 py-2 font-medium">Late arrivals</th>
                <th className="px-4 py-2 font-medium">Total late (min)</th>
                <th className="px-4 py-2 font-medium">Over-time clock-outs</th>
                <th className="px-4 py-2 font-medium">Total over (min)</th>
              </tr>
            </thead>
            <tbody>
              {staffRows.map((row) => (
                <tr key={row.name} className="border-t border-surface-border">
                  <td className="px-4 py-2 font-medium">{row.name}</td>
                  <td className="px-4 py-2">{row.totalHours.toFixed(2)}</td>
                  <td className="px-4 py-2">{row.lateCount}</td>
                  <td className="px-4 py-2">{row.lateMinutes}</td>
                  <td className="px-4 py-2">{row.overCount}</td>
                  <td className="px-4 py-2">{row.overMinutes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
