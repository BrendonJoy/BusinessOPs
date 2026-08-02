import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'
import { getCompanyModules, getTimesheetSettings } from '@/lib/company'
import { formatDayLabel } from '@/lib/dates'
import { Card, EmptyState } from '@/components/ui'
import { JOB_STATUS_GROUPS, TIMESHEET_MISC_CATEGORY_LABELS, type TimesheetDayStatus, type TimesheetMiscCategory } from '@trade-assist/db'
import ClockWidget from './ClockWidget'
import SubmitDayButton from './SubmitDayButton'
import { clockIn, clockOut, submitDay } from './actions'

type OpenEntryRow = {
  id: string
  job_id: string | null
  misc_category: TimesheetMiscCategory | null
  clock_in: string
  job: { job_number: string | null; customer: { name: string | null } | null } | null
}

type HistoryRow = {
  id: string
  job_id: string | null
  misc_category: TimesheetMiscCategory | null
  clock_in: string
  clock_out: string | null
  day_id: string | null
  job: { job_number: string | null } | null
}

type DayRow = { id: string; work_date: string; status: TimesheetDayStatus }

function localYMD(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const DAY_STATUS_BADGES: Record<TimesheetDayStatus | 'unsubmitted', { label: string; className: string }> = {
  unsubmitted: { label: 'Not submitted', className: 'border border-surface-border text-muted' },
  submitted: { label: 'Submitted', className: 'bg-accent/10 text-accent' },
  approved: { label: 'Approved', className: 'bg-accent text-accent-foreground' },
}

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile) redirect('/login')

  const { modules_timesheets_enabled } = await getCompanyModules(supabase)
  if (!modules_timesheets_enabled) redirect('/jobs')

  const settings = await getTimesheetSettings(supabase)
  const isCompany = isCompanyAccount(profile.role)

  const { data: openEntryData } = await supabase
    .from('timesheet_entries')
    .select('id, job_id, misc_category, clock_in, job:jobs(job_number, customer:customers(name))')
    .eq('profile_id', profile.id)
    .is('clock_out', null)
    .maybeSingle()

  const openEntryRow = openEntryData as unknown as OpenEntryRow | null

  const openEntry = openEntryRow
    ? {
        id: openEntryRow.id,
        label: openEntryRow.job_id
          ? `${openEntryRow.job?.job_number ?? 'Job'} — ${openEntryRow.job?.customer?.name ?? 'Customer'}`
          : TIMESHEET_MISC_CATEGORY_LABELS[openEntryRow.misc_category!],
        clockInTime: formatTime(openEntryRow.clock_in),
      }
    : null

  // Staff without view-all only get jobs they're assigned to (inner join on
  // the job_assignments membership table).
  const restrictToAssigned = !isCompany && !profile.can_view_all_jobs
  let jobsQuery = supabase
    .from('jobs')
    .select(
      restrictToAssigned
        ? 'id, job_number, customer:customers(name), job_assignments!inner(profile_id)'
        : ('id, job_number, customer:customers(name)' as string)
    )
    .in('status', JOB_STATUS_GROUPS.active)
    .order('job_number')

  if (restrictToAssigned) {
    jobsQuery = jobsQuery.eq('job_assignments.profile_id', profile.id)
  }

  const { data: jobsData } = await jobsQuery
  type ClockJobRow = { id: string; job_number: string | null; customer: { name: string | null } | null }
  const jobs = ((jobsData ?? []) as unknown as ClockJobRow[]).map((j) => ({
    id: j.id,
    job_number: j.job_number,
    customerName: j.customer?.name ?? null,
  }))

  const now = new Date()
  const historyStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

  const [{ data: historyData }, { data: daysData }] = await Promise.all([
    supabase
      .from('timesheet_entries')
      .select('id, job_id, misc_category, clock_in, clock_out, day_id, job:jobs(job_number)')
      .eq('profile_id', profile.id)
      .gte('clock_in', historyStart.toISOString())
      .order('clock_in', { ascending: false }),
    supabase
      .from('timesheet_days')
      .select('id, work_date, status')
      .eq('profile_id', profile.id)
      .gte('work_date', localYMD(historyStart)),
  ])

  const history = (historyData ?? []) as unknown as HistoryRow[]
  const daysById = new Map<string, DayRow>()
  for (const day of (daysData ?? []) as DayRow[]) daysById.set(day.id, day)

  // Group entries into days: submitted entries by their day's work_date,
  // unsubmitted ones by the local date of their clock-in.
  const dayGroups = new Map<string, { status: TimesheetDayStatus | 'unsubmitted'; entries: HistoryRow[]; hasOpen: boolean }>()

  for (const entry of history) {
    const day = entry.day_id ? daysById.get(entry.day_id) : undefined
    const workDate = day ? day.work_date : localYMD(new Date(entry.clock_in))
    const group = dayGroups.get(workDate) ?? {
      status: day ? day.status : ('unsubmitted' as const),
      entries: [],
      hasOpen: false,
    }
    if (day) group.status = day.status
    group.entries.push(entry)
    if (!entry.clock_out) group.hasOpen = true
    dayGroups.set(workDate, group)
  }

  const sortedDays = Array.from(dayGroups.entries()).sort((a, b) => b[0].localeCompare(a[0]))

  const boundClockIn = clockIn
  const boundClockOut = clockOut.bind(null, openEntry?.id ?? '')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Timesheet</h1>
        {isCompany && (
          <div className="flex gap-4">
            <Link href="/timesheet/approvals" className="text-sm text-accent hover:opacity-80">
              Approvals →
            </Link>
            <Link href="/timesheet/payroll" className="text-sm text-accent hover:opacity-80">
              Payroll →
            </Link>
          </div>
        )}
      </div>

      {error && <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>}

      <ClockWidget
        openEntry={openEntry}
        jobs={jobs}
        geofenceEnabled={settings.geofence_enabled}
        clockInAction={boundClockIn}
        clockOutAction={boundClockOut}
      />

      <Card>
        <h2 className="mb-3 text-sm font-medium">Last 14 days</h2>
        {sortedDays.length === 0 ? (
          <EmptyState title="No timesheet entries yet." description="Clock in above to start tracking time." />
        ) : (
          <div className="flex flex-col gap-4">
            {sortedDays.map(([workDate, group]) => {
              const badge = DAY_STATUS_BADGES[group.status]
              return (
                <div key={workDate} className="border-t border-surface-border pt-3 first:border-t-0 first:pt-0">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{formatDayLabel(workDate)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${badge.className}`}>{badge.label}</span>
                    </div>
                    {group.status === 'unsubmitted' && !group.hasOpen && (
                      <SubmitDayButton workDate={workDate} submitAction={submitDay} />
                    )}
                  </div>
                  <ul className="flex flex-col gap-1 text-sm">
                    {group.entries.map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between gap-4">
                        <span>
                          {entry.job_id
                            ? (entry.job?.job_number ?? 'Job')
                            : TIMESHEET_MISC_CATEGORY_LABELS[entry.misc_category!]}
                        </span>
                        <span className="text-muted">
                          {formatTime(entry.clock_in)}
                          {entry.clock_out ? ` – ${formatTime(entry.clock_out)}` : ' (in progress)'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
