import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'
import { getCompanyModules, getGeofenceSettings } from '@/lib/company'
import { formatAuditTimestamp } from '@/lib/audit'
import { JOB_STATUS_GROUPS, TIMESHEET_MISC_CATEGORY_LABELS, type TimesheetMiscCategory } from '@trade-assist/db'
import ClockWidget from './ClockWidget'
import { clockIn, clockOut } from './actions'

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
  job: { job_number: string | null } | null
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

  const { geofence_enabled } = await getGeofenceSettings(supabase)
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
        clockInTime: new Date(openEntryRow.clock_in).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      }
    : null

  let jobsQuery = supabase
    .from('jobs')
    .select('id, job_number, customer:customers(name)')
    .in('status', JOB_STATUS_GROUPS.active)
    .order('job_number')

  if (!isCompany && !profile.can_view_all_jobs) {
    jobsQuery = jobsQuery.eq('assigned_user_id', profile.id)
  }

  const { data: jobsData } = await jobsQuery
  const jobs = (jobsData ?? []).map((j) => ({
    id: j.id,
    job_number: j.job_number,
    customerName: (j.customer as unknown as { name: string | null } | null)?.name ?? null,
  }))

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: historyData } = await supabase
    .from('timesheet_entries')
    .select('id, job_id, misc_category, clock_in, clock_out, job:jobs(job_number)')
    .eq('profile_id', profile.id)
    .gte('clock_in', sevenDaysAgo)
    .order('clock_in', { ascending: false })

  const history = (historyData ?? []) as unknown as HistoryRow[]

  const boundClockIn = clockIn
  const boundClockOut = clockOut.bind(null, openEntry?.id ?? '')

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Timesheet</h1>

      {error && <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>}

      <ClockWidget
        openEntry={openEntry}
        jobs={jobs}
        geofenceEnabled={geofence_enabled}
        clockInAction={boundClockIn}
        clockOutAction={boundClockOut}
      />

      <section className="rounded-lg border border-surface-border p-4">
        <h2 className="mb-3 text-sm font-medium">Last 7 days</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">No timesheet entries yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {history.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-4 border-t border-surface-border pt-2 first:border-t-0 first:pt-0">
                <span>
                  {entry.job_id
                    ? (entry.job?.job_number ?? 'Job')
                    : TIMESHEET_MISC_CATEGORY_LABELS[entry.misc_category!]}
                </span>
                <span className="text-muted">
                  {formatAuditTimestamp(entry.clock_in)}
                  {entry.clock_out ? ` – ${new Date(entry.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ' (in progress)'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
