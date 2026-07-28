'use client'

import { useState } from 'react'
import Link from 'next/link'
import { JOB_STATUS_LABELS } from '@trade-assist/db'
import type { JobWithCustomer } from '@/lib/jobs'
import { rescheduleJob } from './actions'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const BAR_HEIGHT_REM = 1.375

type MultiDayBar = {
  job: JobWithCustomer
  startCol: number
  span: number
  lane: number
}

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
  canSchedule,
}: {
  gridDays: string[]
  monthParam: string
  todayStr: string
  jobsByDate: Record<string, JobWithCustomer[]>
  multiDayJobs: JobWithCustomer[]
  canSchedule: boolean
}) {
  const [hoveredDay, setHoveredDay] = useState<string | null>(null)

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

  return (
    <div className="overflow-hidden rounded-lg border border-surface-border bg-surface-border">
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

        const bars: MultiDayBar[] = []
        for (const job of multiDayJobs) {
          if (!job.start_date || !job.finish_date) continue
          if (job.finish_date < weekStart || job.start_date > weekEnd) continue
          const segStart = job.start_date < weekStart ? weekStart : job.start_date
          const segEnd = job.finish_date > weekEnd ? weekEnd : job.finish_date
          const startCol = week.indexOf(segStart)
          const endCol = week.indexOf(segEnd)
          bars.push({ job, startCol, span: endCol - startCol + 1, lane: 0 })
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
                <div
                  key={day}
                  onDragOver={(e) => handleDragOver(e, day)}
                  onDragLeave={() => setHoveredDay((prev) => (prev === day ? null : prev))}
                  onDrop={(e) => handleDrop(e, day)}
                  className={`min-h-[6rem] bg-background p-1.5 ${inMonth ? '' : 'opacity-40'} ${
                    isHovered ? 'bg-accent/10' : ''
                  }`}
                  style={{ paddingTop: `${0.375 + barsAreaHeight}rem` }}
                >
                  <div
                    className={`mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                      isToday ? 'bg-accent text-accent-foreground' : 'text-muted'
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
                        className={`block truncate rounded bg-surface px-1.5 py-0.5 text-xs hover:bg-accent/10 ${canSchedule ? 'cursor-grab active:cursor-grabbing' : ''}`}
                        title={`${job.job_number ?? ''} — ${job.customer?.name ?? ''} (${JOB_STATUS_LABELS[job.status]})`}
                      >
                        {job.job_number} {job.customer?.name ?? ''}
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}

            {bars.length > 0 && (
              <div className="pointer-events-none absolute inset-0 grid grid-cols-7 gap-px">
                {bars.map((bar) => (
                  <Link
                    key={bar.job.id}
                    href={`/jobs/${bar.job.id}`}
                    draggable={canSchedule}
                    onDragStart={(e) => handleDragStart(e, bar.job)}
                    className={`pointer-events-auto mx-1.5 block truncate rounded bg-accent/20 px-1.5 py-0.5 text-xs font-medium text-accent hover:bg-accent/30 ${canSchedule ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    style={{
                      gridColumn: `${bar.startCol + 1} / span ${bar.span}`,
                      marginTop: `${0.375 + bar.lane * BAR_HEIGHT_REM}rem`,
                    }}
                    title={`${bar.job.job_number ?? ''} — ${bar.job.customer?.name ?? ''} (${JOB_STATUS_LABELS[bar.job.status]})`}
                  >
                    {bar.job.job_number} {bar.job.customer?.name ?? ''}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
