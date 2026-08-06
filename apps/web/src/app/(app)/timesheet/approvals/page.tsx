import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'
import { companyHasStaffFeatures } from '@/lib/entitlements'
import { getCompanyModules } from '@/lib/company'
import { TIMESHEET_MISC_CATEGORY_LABELS, type TimesheetDayStatus, type TimesheetMiscCategory } from '@trade-assist/db'
import { Button, Card, EmptyState, Input, Notice } from '@/components/ui'
import { approveDay, deleteTimesheetEntry, updateEntryTimes } from '../approval-actions'

type DayRow = {
  id: string
  profile_id: string
  work_date: string
  status: TimesheetDayStatus
  submitted_at: string
  approved_at: string | null
  profile: { full_name: string | null; email: string } | null
}

type EntryRow = {
  id: string
  job_id: string | null
  misc_category: TimesheetMiscCategory | null
  clock_in: string
  clock_out: string | null
  day_id: string | null
  job: { job_number: string | null } | null
}

function toHHMM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function entryLabel(entry: EntryRow): string {
  return entry.job_id
    ? (entry.job?.job_number ?? 'Job')
    : TIMESHEET_MISC_CATEGORY_LABELS[entry.misc_category!]
}

export default async function TimesheetApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  const { modules_timesheets_enabled } = await getCompanyModules(supabase)
  // Approving is about other people's time, so it belongs to the Company tier.
  // A sole trader still keeps their own timesheet — there is just nobody to
  // approve.
  const staffFeatures = await companyHasStaffFeatures(supabase)
  if (!modules_timesheets_enabled || !isCompanyAccount(profile?.role) || !staffFeatures) {
    redirect('/timesheet')
  }

  const now = new Date()
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: daysData } = await supabase
    .from('timesheet_days')
    .select('id, profile_id, work_date, status, submitted_at, approved_at, profile:profiles!profile_id(full_name, email)')
    .or(`status.eq.submitted,work_date.gte.${twoWeeksAgo}`)
    .order('work_date', { ascending: false })

  const days = (daysData ?? []) as unknown as DayRow[]
  const dayIds = days.map((d) => d.id)

  const { data: entriesData } = dayIds.length
    ? await supabase
        .from('timesheet_entries')
        .select('id, job_id, misc_category, clock_in, clock_out, day_id, job:jobs(job_number)')
        .in('day_id', dayIds)
        .order('clock_in', { ascending: true })
    : { data: [] }

  const entriesByDay = new Map<string, EntryRow[]>()
  for (const entry of (entriesData ?? []) as unknown as EntryRow[]) {
    if (!entry.day_id) continue
    const list = entriesByDay.get(entry.day_id) ?? []
    list.push(entry)
    entriesByDay.set(entry.day_id, list)
  }

  const submitted = days.filter((d) => d.status === 'submitted')
  const approved = days.filter((d) => d.status === 'approved')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Timesheet approvals</h1>
        <Link href="/timesheet" className="text-sm text-accent hover:opacity-80">
          ← Back to Timesheet
        </Link>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <Card>
        <h2 className="mb-3 text-sm font-medium">Awaiting approval</h2>
        {submitted.length === 0 ? (
          <EmptyState title="No submitted days waiting for approval." />
        ) : (
          <div className="flex flex-col gap-5">
            {submitted.map((day) => (
              <div key={day.id} className="border-t border-surface-border pt-4 first:border-t-0 first:pt-0">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">
                    <span className="font-medium">{day.profile?.full_name ?? day.profile?.email ?? 'Unknown'}</span>{' '}
                    — {formatDayLabel(day.work_date)}
                  </p>
                  <form action={approveDay.bind(null, day.id)}>
                    <Button type="submit" variant="primary" size="sm">
                      Approve day
                    </Button>
                  </form>
                </div>
                <div className="flex flex-col gap-2">
                  {(entriesByDay.get(day.id) ?? []).map((entry) => (
                    <div key={entry.id} className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="w-24 shrink-0">{entryLabel(entry)}</span>
                      <form
                        action={updateEntryTimes.bind(null, entry.id)}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <Input
                          name="clock_in_time"
                          type="time"
                          aria-label="Clock in time"
                          defaultValue={toHHMM(entry.clock_in)}
                          fullWidth={false}
                        />
                        <span className="text-muted">–</span>
                        <Input
                          name="clock_out_time"
                          type="time"
                          aria-label="Clock out time"
                          defaultValue={entry.clock_out ? toHHMM(entry.clock_out) : ''}
                          fullWidth={false}
                        />
                        <Button type="submit" size="sm">
                          Save times
                        </Button>
                      </form>
                      <form action={deleteTimesheetEntry.bind(null, entry.id)}>
                        <button type="submit" className="text-xs text-accent hover:opacity-80">
                          Remove
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-medium">Recently approved</h2>
        {approved.length === 0 ? (
          <EmptyState title="Nothing approved in the last 14 days." />
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {approved.map((day) => (
              <li key={day.id} className="flex items-center justify-between gap-4 border-t border-surface-border pt-2 first:border-t-0 first:pt-0">
                <span>
                  <span className="font-medium">{day.profile?.full_name ?? day.profile?.email ?? 'Unknown'}</span>{' '}
                  — {formatDayLabel(day.work_date)}
                </span>
                <span className="text-muted">
                  {(entriesByDay.get(day.id) ?? [])
                    .map((entry) => `${entryLabel(entry)} ${toHHMM(entry.clock_in)}–${entry.clock_out ? toHHMM(entry.clock_out) : '…'}`)
                    .join(', ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
