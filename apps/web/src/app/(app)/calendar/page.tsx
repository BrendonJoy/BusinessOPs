import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCalendarGridDays, getMonthInfo } from '@/lib/calendar'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'
import type { JobWithCustomer } from '@/lib/jobs'
import { JOB_STATUS_LABELS, type JobStatus } from '@trade-assist/db'
import { buttonClasses } from '@/components/ui'
import { STATUS_DOT } from './status-style'
import CalendarGrid from './CalendarGrid'

// Cancelled is omitted deliberately: it's rare, self-evident when you see the
// strikethrough, and a six-item legend starts competing with the calendar.
const LEGEND_STATUSES: JobStatus[] = ['quoted', 'scheduled', 'in_progress', 'completed', 'invoiced']

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month } = await searchParams
  const monthInfo = getMonthInfo(month)
  const gridDays = getCalendarGridDays(monthInfo.year, monthInfo.month)
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`

  const gridStart = gridDays[0]
  const gridEnd = gridDays[gridDays.length - 1]

  // Drives the Today button, which only appears when it would do something.
  const isCurrentMonth = monthInfo.monthParam === todayStr.slice(0, 7)

  const supabase = await createClient()
  const currentProfile = await getCurrentProfile(supabase)
  const canSchedule = isCompanyAccount(currentProfile?.role) || Boolean(currentProfile?.can_schedule)

  const { data } = await supabase
    .from('jobs')
    .select('*, customer:customers(id, name)')
    .lte('start_date', gridEnd)
    .or(`finish_date.gte.${gridStart},and(finish_date.is.null,start_date.gte.${gridStart})`)

  const jobs = (data ?? []) as unknown as JobWithCustomer[]

  // Jobs spanning more than one day render as a bar across their date range
  // instead of a per-day chip -- everything else keeps the original
  // one-chip-on-its-start-day behavior.
  const jobsByDate: Record<string, JobWithCustomer[]> = {}
  const multiDayJobs: JobWithCustomer[] = []
  for (const job of jobs) {
    if (!job.start_date) continue
    if (job.finish_date && job.finish_date !== job.start_date) {
      multiDayJobs.push(job)
      continue
    }
    const list = jobsByDate[job.start_date] ?? []
    list.push(job)
    jobsByDate[job.start_date] = list
  }

  return (
    <div>
      {/* Stacks on a phone: the old single row put "Calendar" and three
          controls on one line, so the heading collided with the Prev button. */}
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Calendar</h1>

        <div className="flex items-center gap-2">
          <Link
            href={`/calendar?month=${monthInfo.prevMonthParam}`}
            aria-label="Previous month"
            className={buttonClasses('secondary', 'sm', 'px-3')}
          >
            ←
          </Link>
          {/* Fixed width stops the controls shuffling sideways as the month
              name changes length between, say, May and September. */}
          <span className="min-w-[9.5rem] text-center text-sm font-medium">{monthInfo.label}</span>
          <Link
            href={`/calendar?month=${monthInfo.nextMonthParam}`}
            aria-label="Next month"
            className={buttonClasses('secondary', 'sm', 'px-3')}
          >
            →
          </Link>
          {!isCurrentMonth && (
            <Link href="/calendar" className={buttonClasses('secondary', 'sm', 'ml-1')}>
              Today
            </Link>
          )}
        </div>
      </div>

      {/* Legend — the colours are only self-explanatory once. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        {LEGEND_STATUSES.map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
            {JOB_STATUS_LABELS[status]}
          </span>
        ))}
      </div>

      <CalendarGrid
        gridDays={gridDays}
        monthParam={monthInfo.monthParam}
        todayStr={todayStr}
        jobsByDate={jobsByDate}
        multiDayJobs={multiDayJobs}
        canSchedule={canSchedule}
      />
    </div>
  )
}
