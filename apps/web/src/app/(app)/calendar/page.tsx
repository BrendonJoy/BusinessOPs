import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCalendarGridDays, getMonthInfo } from '@/lib/calendar'
import type { JobWithCustomer } from '@/lib/jobs'
import CalendarGrid from './CalendarGrid'
import RoutePlanner from './RoutePlanner'

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

  const supabase = await createClient()
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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Calendar</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link
            href={`/calendar?month=${monthInfo.prevMonthParam}`}
            className="rounded-md border border-surface-border px-3 py-1.5 hover:border-accent"
          >
            ← Prev
          </Link>
          <span className="font-medium">{monthInfo.label}</span>
          <Link
            href={`/calendar?month=${monthInfo.nextMonthParam}`}
            className="rounded-md border border-surface-border px-3 py-1.5 hover:border-accent"
          >
            Next →
          </Link>
        </div>
      </div>

      <RoutePlanner />

      <CalendarGrid
        gridDays={gridDays}
        monthParam={monthInfo.monthParam}
        todayStr={todayStr}
        jobsByDate={jobsByDate}
        multiDayJobs={multiDayJobs}
      />
    </div>
  )
}
