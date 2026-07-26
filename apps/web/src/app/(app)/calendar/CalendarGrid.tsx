'use client'

import { useState } from 'react'
import Link from 'next/link'
import { JOB_STATUS_LABELS } from '@trade-assist/db'
import type { JobWithCustomer } from '@/lib/jobs'
import { rescheduleJob } from './actions'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CalendarGrid({
  gridDays,
  monthParam,
  todayStr,
  jobsByDate,
}: {
  gridDays: string[]
  monthParam: string
  todayStr: string
  jobsByDate: Record<string, JobWithCustomer[]>
}) {
  const [hoveredDay, setHoveredDay] = useState<string | null>(null)

  function handleDragStart(e: React.DragEvent, job: JobWithCustomer) {
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ jobId: job.id, startDate: job.start_date, finishDate: job.finish_date })
    )
  }

  function handleDragOver(e: React.DragEvent, day: string) {
    e.preventDefault()
    setHoveredDay(day)
  }

  async function handleDrop(e: React.DragEvent, day: string) {
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

  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-surface-border bg-surface-border text-sm">
      {WEEKDAY_LABELS.map((label) => (
        <div key={label} className="bg-surface px-2 py-1.5 text-center text-xs font-medium text-muted">
          {label}
        </div>
      ))}

      {gridDays.map((day) => {
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
                  draggable
                  onDragStart={(e) => handleDragStart(e, job)}
                  className="block cursor-grab truncate rounded bg-surface px-1.5 py-0.5 text-xs hover:bg-accent/10 active:cursor-grabbing"
                  title={`${job.job_number ?? ''} — ${job.customer?.name ?? ''} (${JOB_STATUS_LABELS[job.status]})`}
                >
                  {job.job_number} {job.customer?.name ?? ''}
                </Link>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
