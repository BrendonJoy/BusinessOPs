'use client'

import { useState } from 'react'
import Link from 'next/link'
import { JOB_STATUS_LABELS } from '@trade-assist/db'
import type { JobWithCustomer } from '@/lib/jobs'
import { rescheduleJob } from './actions'
import { formatDayLabel } from '@/lib/dates'
import { EmptyState } from '@/components/ui'
import LocalTime from '@/components/LocalTime'
import { STATUS_CHIP, STATUS_DOT, timeLabel } from './status-style'
import DayView from './DayView'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const BAR_HEIGHT_REM = 1.375

export type CalendarShift = {
  id: string
  title: string | null
  teamName: string
  eventName: string | null
  startsAt: string
  endsAt: string
  assignedCount: number
}

export type EventRun = {
  id: string
  name: string
  startDate: string
  endDate: string
}

/**
 * A bar spanning several days — a multi-day job, or an event's whole run.
 *
 * Both kinds share one lane allocation rather than being drawn in separate
 * layers, because they occupy the same strip at the top of a week and two
 * independent packings would happily stack a job on top of an event.
 */
type MultiDayBar = {
  key: string
  href: string
  label: string
  time: string | null
  title: string
  className: string
  job: JobWithCustomer | null
  startDate: string
  endDate: string
  startCol: number
  span: number
  lane: number
}

// Shifts carry no status, so they get one consistent look that reads as
// distinct from a job chip rather than borrowing a status colour that would
// mean something it doesn't.
const SHIFT_CHIP = 'border border-accent/40 bg-accent/10 text-foreground'
const EVENT_BAR = 'border border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-300'

function chunkWeeks(days: string[]): string[][] {
  const weeks: string[][] = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
  return weeks
}

// Greedily packs date-range segments into the fewest stacked lanes so
// overlapping multi-day jobs in the same week don't render on top of each other.
function assignLanes(segments: { startCol: number; span: number }[]): number[] {
  const order = segments.map((_, i) => i).sort((a, b) => segments[a].startCol - segments[b].startCol)
  const laneEnds: number[] = []
  const lanes = new Array(segments.length).fill(0)

  for (const i of order) {
    const seg = segments[i]
    let lane = laneEnds.findIndex((end) => end <= seg.startCol)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(0)
    }
    laneEnds[lane] = seg.startCol + seg.span
    lanes[i] = lane
  }

  return lanes
}

export default function CalendarGrid({
  gridDays,
  monthParam,
  todayStr,
  jobsByDate,
  multiDayJobs,
  shiftsByDate,
  eventRuns,
  canSchedule,
}: {
  gridDays: string[]
  monthParam: string
  todayStr: string
  jobsByDate: Record<string, JobWithCustomer[]>
  multiDayJobs: JobWithCustomer[]
  shiftsByDate: Record<string, CalendarShift[]>
  eventRuns: EventRun[]
  canSchedule: boolean
}) {
  const [hoveredDay, setHoveredDay] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // Everything touching a given day: single-day chips plus any multi-day
  // job whose date range covers it.
  function jobsOnDay(day: string): JobWithCustomer[] {
    const single = jobsByDate[day] ?? []
    const spanning = multiDayJobs.filter(
      (job) => job.start_date && job.start_date <= day && (job.finish_date ?? job.start_date) >= day
    )
    return [...single, ...spanning]
  }

  function handleDayClick(e: React.MouseEvent, day: string) {
    // Ignore clicks that were really on a job chip/bar link.
    if ((e.target as HTMLElement).closest('a')) return
    setSelectedDay(day)
  }

  function handleDragStart(e: React.DragEvent, job: JobWithCustomer) {
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ jobId: job.id, startDate: job.start_date, finishDate: job.finish_date })
    )
  }

  function handleDragOver(e: React.DragEvent, day: string) {
    if (!canSchedule) return
    e.preventDefault()
    setHoveredDay(day)
  }

  async function handleDrop(e: React.DragEvent, day: string) {
    if (!canSchedule) return
    e.preventDefault()
    setHoveredDay(null)
    const raw = e.dataTransfer.getData('application/json')
    if (!raw) return
    const { jobId, startDate, finishDate } = JSON.parse(raw) as {
      jobId: string
      startDate: string | null
      finishDate: string | null
    }
    if (!startDate || startDate === day) return
    await rescheduleJob(jobId, startDate, day, finishDate)
  }

  const weeks = chunkWeeks(gridDays)

  // Days in the displayed month that actually have work, for the phone agenda.
  // Sorted by time within each day so the list reads like a run sheet.
  const agendaDays = gridDays
    .filter((day) => day.slice(0, 7) === monthParam)
    .map((day) => ({
      day,
      jobs: jobsOnDay(day).sort((a, b) =>
        (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99')
      ),
      shifts: [...(shiftsByDate[day] ?? [])].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    }))
    .filter(({ jobs, shifts }) => jobs.length + shifts.length > 0)

  return (
    <>
      {selectedDay && (
        <DayView
          day={selectedDay}
          jobs={jobsOnDay(selectedDay)}
          shifts={shiftsByDate[selectedDay] ?? []}
          canSchedule={canSchedule}
          onClose={() => setSelectedDay(null)}
        />
      )}
    {/* Agenda — phones only.
        A seven-column month grid at 375px gives each day ~50px, which truncated
        every chip to "JO…" and told the user nothing. This lists only the days
        that actually have work, so a month of scrolling past empty cells becomes
        a short, readable list. */}
    <div className="flex flex-col gap-3 sm:hidden">
      {agendaDays.length === 0 ? (
        <EmptyState
          title="Nothing scheduled this month"
          description="Jobs with a start date will appear here."
        />
      ) : (
        agendaDays.map(({ day, jobs, shifts }) => (
          <div key={day} className="rounded-lg border border-surface-border">
            <button
              type="button"
              onClick={() => setSelectedDay(day)}
              className={`flex min-h-11 w-full items-center justify-between gap-2 border-b border-surface-border px-3 text-left text-sm font-medium ${
                day === todayStr ? 'text-accent' : ''
              }`}
            >
              <span>
                {formatDayLabel(day)}
                {day === todayStr && <span className="ml-2 text-xs font-normal">Today</span>}
              </span>
              <span className="text-xs font-normal text-muted">
                {[
                  jobs.length > 0 && `${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'}`,
                  shifts.length > 0 &&
                    `${shifts.length} ${shifts.length === 1 ? 'shift' : 'shifts'}`,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </span>
            </button>
            <ul className="flex flex-col divide-y divide-surface-border">
              {jobs.map((job) => (
                <li key={job.id}>
                  <Link
                    href={`/jobs/${job.id}`}
                    className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm active:bg-surface"
                  >
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[job.status]}`}
                    />
                    {timeLabel(job.start_time) && (
                      <span className="shrink-0 tabular-nums text-muted">
                        {timeLabel(job.start_time)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {job.customer?.name ?? 'No customer'}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{job.job_number}</span>
                  </Link>
                </li>
              ))}

              {shifts.map((shift) => (
                <li key={shift.id}>
                  <Link
                    href="/roster"
                    className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm active:bg-surface"
                  >
                    <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-accent" />
                    <span className="shrink-0 tabular-nums text-muted">
                      <LocalTime iso={shift.startsAt} format="time" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {shift.title ?? shift.teamName}
                      {shift.eventName && (
                        <span className="ml-1 text-muted">· {shift.eventName}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {shift.assignedCount === 0 ? 'unstaffed' : `${shift.assignedCount} on`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>

    <div className="hidden overflow-hidden rounded-lg border border-surface-border bg-surface-border sm:block">
      <div className="grid grid-cols-7 gap-px text-sm">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="bg-surface px-2 py-1.5 text-center text-xs font-medium text-muted">
            {label}
          </div>
        ))}
      </div>

      {weeks.map((week) => {
        const weekStart = week[0]
        const weekEnd = week[6]

        const spanning: Omit<MultiDayBar, 'startCol' | 'span' | 'lane'>[] = [
          ...multiDayJobs
            .filter((job) => job.start_date && job.finish_date)
            .map((job) => ({
              key: `job-${job.id}`,
              href: `/jobs/${job.id}`,
              label: job.customer?.name ?? job.job_number ?? 'Job',
              time: timeLabel(job.start_time) || null,
              title: `${job.job_number ?? ''} — ${job.customer?.name ?? ''} (${JOB_STATUS_LABELS[job.status]})`,
              className: STATUS_CHIP[job.status],
              job,
              startDate: job.start_date!,
              endDate: job.finish_date!,
            })),
          ...eventRuns.map((event) => ({
            key: `event-${event.id}`,
            href: `/events/${event.id}`,
            label: event.name,
            time: null,
            title: `${event.name} — ${event.startDate} to ${event.endDate}`,
            className: EVENT_BAR,
            // Events are not draggable: moving one means moving its typed days,
            // which is an edit on the event rather than a date swap.
            job: null,
            startDate: event.startDate,
            endDate: event.endDate,
          })),
        ]

        const bars: MultiDayBar[] = []
        for (const item of spanning) {
          if (item.endDate < weekStart || item.startDate > weekEnd) continue
          const segStart = item.startDate < weekStart ? weekStart : item.startDate
          const segEnd = item.endDate > weekEnd ? weekEnd : item.endDate
          const startCol = week.indexOf(segStart)
          const endCol = week.indexOf(segEnd)
          bars.push({ ...item, startCol, span: endCol - startCol + 1, lane: 0 })
        }
        const lanes = assignLanes(bars.map((b) => ({ startCol: b.startCol, span: b.span })))
        bars.forEach((b, i) => (b.lane = lanes[i]))
        const laneCount = bars.length > 0 ? Math.max(...lanes) + 1 : 0
        const barsAreaHeight = laneCount * BAR_HEIGHT_REM

        return (
          <div key={weekStart} className="relative grid grid-cols-7 gap-px text-sm">
            {week.map((day) => {
              const inMonth = day.slice(0, 7) === monthParam
              const isToday = day === todayStr
              const dayJobs = jobsByDate[day] ?? []
              const dayNumber = Number(day.slice(8, 10))
              const isHovered = hoveredDay === day

              return (
                // A day cell is clickable (it opens the day view) but nothing
                // said so — no hover, no outline, no pointer feedback. The only
                // visual response was during a drag. Cells now carry a faint
                // inset ring at rest so each day reads as its own target, and a
                // stronger ring plus a background lift on hover and focus.
                <div
                  key={day}
                  role="button"
                  tabIndex={0}
                  aria-label={`View jobs on ${day}`}
                  onDragOver={(e) => handleDragOver(e, day)}
                  onDragLeave={() => setHoveredDay((prev) => (prev === day ? null : prev))}
                  onDrop={(e) => handleDrop(e, day)}
                  onClick={(e) => handleDayClick(e, day)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedDay(day)
                    }
                  }}
                  className={`relative min-h-[6rem] cursor-pointer bg-background p-1.5 ring-1 ring-inset ring-surface-border/50 transition-colors hover:bg-surface/40 hover:ring-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    inMonth ? '' : 'opacity-40'
                  } ${isHovered ? 'bg-accent/10 ring-accent' : ''}`}
                  style={{ paddingTop: `${0.375 + barsAreaHeight}rem` }}
                >
                  <div
                    className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                      isToday ? 'bg-accent font-semibold text-accent-foreground' : 'text-muted'
                    }`}
                  >
                    {dayNumber}
                  </div>
                  <div className="flex flex-col gap-1">
                    {dayJobs.map((job) => (
                      <Link
                        key={job.id}
                        href={`/jobs/${job.id}`}
                        draggable={canSchedule}
                        onDragStart={(e) => handleDragStart(e, job)}
                        className={`block truncate rounded px-1.5 py-0.5 text-xs transition-opacity hover:opacity-80 ${STATUS_CHIP[job.status]} ${canSchedule ? 'cursor-grab active:cursor-grabbing' : ''}`}
                        title={`${job.job_number ?? ''} — ${job.customer?.name ?? ''} (${JOB_STATUS_LABELS[job.status]})`}
                      >
                        {/* Time first: when scheduling, "8:00" is the thing
                            being scanned for, not the job number. */}
                        {timeLabel(job.start_time) && (
                          <span className="mr-1 font-medium tabular-nums">
                            {timeLabel(job.start_time)}
                          </span>
                        )}
                        {job.customer?.name ?? job.job_number}
                      </Link>
                    ))}

                    {(shiftsByDate[day] ?? []).map((shift) => (
                      <Link
                        key={shift.id}
                        href="/roster"
                        className={`block truncate rounded px-1.5 py-0.5 text-xs transition-opacity hover:opacity-80 ${SHIFT_CHIP}`}
                        title={`${shift.title ?? shift.teamName}${shift.eventName ? ` — ${shift.eventName}` : ''} · ${shift.assignedCount} rostered`}
                      >
                        <span className="mr-1 font-medium tabular-nums">
                          <LocalTime iso={shift.startsAt} format="time" />
                        </span>
                        {shift.title ?? shift.teamName}
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}

            {bars.length > 0 && (
              <div className="pointer-events-none absolute inset-0 grid grid-cols-7 gap-px">
                {bars.map((bar) => {
                  const draggable = canSchedule && bar.job !== null
                  return (
                    <Link
                      key={bar.key}
                      href={bar.href}
                      draggable={draggable}
                      onDragStart={(e) => bar.job && handleDragStart(e, bar.job)}
                      // self-start is load-bearing: a grid item stretches to fill
                      // its row by default, so the "bar" was silently filling the
                      // entire week's height and washing out the days underneath.
                      className={`pointer-events-auto mx-1.5 block h-[1.375rem] self-start truncate rounded px-1.5 py-0.5 text-xs leading-4 transition-opacity hover:opacity-80 ${bar.className} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
                      style={{
                        gridColumn: `${bar.startCol + 1} / span ${bar.span}`,
                        marginTop: `${0.375 + bar.lane * BAR_HEIGHT_REM}rem`,
                      }}
                      title={bar.title}
                    >
                      {bar.time && (
                        <span className="mr-1 font-medium tabular-nums">{bar.time}</span>
                      )}
                      {bar.label}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
    </>
  )
}
