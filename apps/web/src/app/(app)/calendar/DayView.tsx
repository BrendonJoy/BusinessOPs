'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { JOB_STATUS_LABELS } from '@trade-assist/db'
import { STATUS_CHIP } from './status-style'
import type { JobWithCustomer } from '@/lib/jobs'
import { LocalTimeRange } from '@/components/LocalTime'
import type { CalendarShift } from './CalendarGrid'
import { rescheduleJobTime } from './actions'

const PX_PER_MIN = 48 / 60 // 48px per hour
const SNAP_MIN = 15
const DEFAULT_DURATION_MIN = 60
const DEFAULT_START_HOUR = 6
const DEFAULT_END_HOUR = 20

function timeToMinutes(time: string): number {
  const [h, m] = time.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - SNAP_MIN, minutes))
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

function formatHourLabel(hour: number): string {
  const suffix = hour < 12 ? 'am' : 'pm'
  const display = hour % 12 === 0 ? 12 : hour % 12
  return `${display}${suffix}`
}

function formatDayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

type Block = {
  job: JobWithCustomer
  startMin: number
  durationMin: number
  col: number
  colCount: number
}

// Greedy column packing so overlapping jobs sit side by side.
function packColumns(items: { startMin: number; endMin: number }[]): { col: number; colCount: number }[] {
  const order = items.map((_, i) => i).sort((a, b) => items[a].startMin - items[b].startMin)
  const colEnds: number[] = []
  const cols = new Array(items.length).fill(0)

  for (const i of order) {
    let col = colEnds.findIndex((end) => end <= items[i].startMin)
    if (col === -1) {
      col = colEnds.length
      colEnds.push(0)
    }
    colEnds[col] = items[i].endMin
    cols[i] = col
  }

  // Everything shares the day's max column count -- simple and stable.
  const colCount = colEnds.length || 1
  return cols.map((col) => ({ col, colCount }))
}

type DragState = {
  jobId: string
  durationMin: number
  topPx: number
  grabOffsetPx: number
  moved: boolean
  fromUnscheduled: boolean
}

export default function DayView({
  day,
  jobs,
  // Optional: the dashboard's "Jobs Today" drill-in reuses this panel and is
  // deliberately about jobs, so it passes none.
  shifts = [],
  canSchedule,
  onClose,
}: {
  day: string
  jobs: JobWithCustomer[]
  shifts?: CalendarShift[]
  canSchedule: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const timelineRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  // Optimistic time overrides after a drop, until refreshed props arrive.
  const [localTimes, setLocalTimes] = useState<Record<string, { start: string; finish: string }>>({})

  // Reset overrides when fresh job data arrives (state-adjust-during-render
  // pattern -- an effect here would trip react-hooks/set-state-in-effect).
  const [prevJobs, setPrevJobs] = useState(jobs)
  if (prevJobs !== jobs) {
    setPrevJobs(jobs)
    setLocalTimes({})
  }

  const effectiveStart = (job: JobWithCustomer) => localTimes[job.id]?.start ?? job.start_time
  const effectiveFinish = (job: JobWithCustomer) => localTimes[job.id]?.finish ?? job.finish_time

  const scheduled = jobs.filter((j) => effectiveStart(j))
  const unscheduled = jobs.filter((j) => !effectiveStart(j))

  // Hour range: 6am-8pm by default, stretched to cover any out-of-range job.
  let startHour = DEFAULT_START_HOUR
  let endHour = DEFAULT_END_HOUR
  for (const job of scheduled) {
    const s = timeToMinutes(effectiveStart(job)!)
    const f = effectiveFinish(job) ? timeToMinutes(effectiveFinish(job)!) : s + DEFAULT_DURATION_MIN
    startHour = Math.min(startHour, Math.floor(s / 60))
    endHour = Math.max(endHour, Math.ceil(f / 60))
  }
  const rangeStartMin = startHour * 60
  const timelineHeight = (endHour - startHour) * 60 * PX_PER_MIN

  const intervals = scheduled.map((job) => {
    const startMin = timeToMinutes(effectiveStart(job)!)
    const endMin = effectiveFinish(job)
      ? Math.max(timeToMinutes(effectiveFinish(job)!), startMin + SNAP_MIN)
      : startMin + DEFAULT_DURATION_MIN
    return { startMin, endMin }
  })
  const packing = packColumns(intervals)

  const blocks: Block[] = scheduled.map((job, i) => ({
    job,
    startMin: intervals[i].startMin,
    durationMin: intervals[i].endMin - intervals[i].startMin,
    col: packing[i].col,
    colCount: packing[i].colCount,
  }))

  function snapMinutes(topPx: number): number {
    const rawMin = rangeStartMin + topPx / PX_PER_MIN
    return Math.round(rawMin / SNAP_MIN) * SNAP_MIN
  }

  function beginDrag(e: React.PointerEvent, jobId: string, durationMin: number, fromUnscheduled: boolean) {
    if (!canSchedule) return
    const timeline = timelineRef.current
    if (!timeline) return
    const rect = timeline.getBoundingClientRect()
    const blockTop = fromUnscheduled
      ? e.clientY - rect.top - 12
      : (blocks.find((b) => b.job.id === jobId)!.startMin - rangeStartMin) * PX_PER_MIN
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({
      jobId,
      durationMin,
      topPx: blockTop,
      grabOffsetPx: fromUnscheduled ? 12 : e.clientY - rect.top - blockTop,
      moved: false,
      fromUnscheduled,
    })
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return
    const rect = timelineRef.current!.getBoundingClientRect()
    const topPx = Math.max(0, Math.min(e.clientY - rect.top - drag.grabOffsetPx, timelineHeight - 24))
    setDrag({ ...drag, topPx, moved: true })
  }

  async function onPointerUp() {
    if (!drag) return
    const { jobId, durationMin, topPx, moved, fromUnscheduled } = drag
    setDrag(null)

    if (!moved) {
      if (!fromUnscheduled) router.push(`/jobs/${jobId}`)
      return
    }

    const newStartMin = snapMinutes(topPx)
    const newStart = minutesToTime(newStartMin)
    const newFinish = minutesToTime(newStartMin + durationMin)

    setLocalTimes((prev) => ({ ...prev, [jobId]: { start: newStart, finish: newFinish } }))
    await rescheduleJobTime(jobId, newStart, newFinish)
  }

  const dragPreviewTime = drag?.moved ? minutesToTime(snapMinutes(drag.topPx)) : null

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-surface-border bg-background shadow-xl sm:w-[28rem]">
      <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
        <h2 className="text-sm font-semibold">{formatDayLabel(day)}</h2>
        <button onClick={onClose} className="text-sm text-muted hover:text-foreground">
          ✕ Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {jobs.length === 0 && shifts.length === 0 && (
          <p className="text-sm text-muted">Nothing on this day.</p>
        )}

        {/* Shifts are listed rather than drawn on the timeline below. That
            timeline exists to drag a job to a new time; a shift's times are
            edited on the roster, and rendering it as a draggable block would
            promise something that does not work. */}
        {shifts.length > 0 && (
          <div className="mb-4">
            <p className="mb-1 text-xs font-medium text-muted">Shifts</p>
            <ul className="flex flex-col gap-1.5">
              {shifts.map((shift) => (
                <li
                  key={shift.id}
                  className="rounded border border-accent/40 bg-accent/10 px-2 py-1.5 text-xs"
                >
                  <span className="font-medium tabular-nums">
                    <LocalTimeRange start={shift.startsAt} end={shift.endsAt} />
                  </span>
                  <span className="ml-2">{shift.title ?? shift.teamName}</span>
                  {shift.title && <span className="ml-1 text-muted">{shift.teamName}</span>}
                  <span className="ml-2 text-muted">
                    {shift.assignedCount === 0 ? 'nobody rostered' : `${shift.assignedCount} rostered`}
                  </span>
                  {shift.eventName && (
                    <span className="mt-0.5 block text-muted">{shift.eventName}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {unscheduled.length > 0 && (
          <div className="mb-4">
            <p className="mb-1 text-xs font-medium text-muted">
              No time set{canSchedule ? ' — drag onto the timeline to schedule' : ''}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {unscheduled.map((job) => (
                <div
                  key={job.id}
                  onPointerDown={(e) => beginDrag(e, job.id, DEFAULT_DURATION_MIN, true)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onClick={() => !canSchedule && router.push(`/jobs/${job.id}`)}
                  className={`touch-none rounded px-2 py-1 text-xs transition-opacity hover:opacity-80 ${STATUS_CHIP[job.status]} ${
                    canSchedule ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                  }`}
                  title={`${job.job_number ?? ''} — ${job.customer?.name ?? ''} (${JOB_STATUS_LABELS[job.status]})`}
                >
                  {job.job_number} {job.customer?.name ?? ''}
                </div>
              ))}
            </div>
          </div>
        )}

        {scheduled.length > 0 || drag ? (
          <div className="flex">
            <div className="w-12 shrink-0 text-right text-xs text-muted">
              {Array.from({ length: endHour - startHour }, (_, i) => (
                <div key={i} style={{ height: 48 }} className="-translate-y-2 pr-2">
                  {formatHourLabel(startHour + i)}
                </div>
              ))}
            </div>
            <div
              ref={timelineRef}
              className="relative flex-1 rounded-md border border-surface-border"
              style={{ height: timelineHeight }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              {Array.from({ length: endHour - startHour }, (_, i) => (
                <div
                  key={i}
                  className="absolute inset-x-0 border-t border-surface-border/60"
                  style={{ top: i * 48 }}
                />
              ))}

              {blocks.map((block) => {
                const isDragging = drag?.jobId === block.job.id && drag.moved
                const top = isDragging ? drag.topPx : (block.startMin - rangeStartMin) * PX_PER_MIN
                const height = Math.max(block.durationMin * PX_PER_MIN, 24)
                const widthPct = 100 / block.colCount
                return (
                  <div
                    key={block.job.id}
                    onPointerDown={(e) => beginDrag(e, block.job.id, block.durationMin, false)}
                    onClick={() => !canSchedule && router.push(`/jobs/${block.job.id}`)}
                    // Same status colours as the month grid — a job shouldn't
                    // change appearance just because you zoomed into its day.
                    className={`absolute touch-none overflow-hidden rounded px-1.5 py-0.5 text-xs transition-opacity hover:opacity-80 ${STATUS_CHIP[block.job.status]} ${
                      canSchedule ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                    } ${isDragging ? 'z-10 opacity-80 ring-2 ring-accent' : ''}`}
                    style={{
                      top,
                      height,
                      left: `calc(${block.col * widthPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                    }}
                    title={`${block.job.job_number ?? ''} — ${block.job.customer?.name ?? ''} (${JOB_STATUS_LABELS[block.job.status]})`}
                  >
                    <span className="font-medium">{block.job.job_number}</span>{' '}
                    {block.job.customer?.name ?? ''}
                    <span className="block text-[10px] text-muted">
                      {isDragging
                        ? `${dragPreviewTime} – ${minutesToTime(snapMinutes(drag!.topPx) + block.durationMin)}`
                        : `${effectiveStart(block.job)!.slice(0, 5)}${
                            effectiveFinish(block.job) ? ` – ${effectiveFinish(block.job)!.slice(0, 5)}` : ''
                          }`}
                    </span>
                  </div>
                )
              })}

              {drag?.fromUnscheduled && drag.moved && (
                <div
                  className="pointer-events-none absolute inset-x-1 z-10 rounded border border-accent bg-accent/25 px-1.5 py-0.5 text-xs"
                  style={{ top: drag.topPx, height: Math.max(drag.durationMin * PX_PER_MIN, 24) }}
                >
                  {dragPreviewTime} – {minutesToTime(snapMinutes(drag.topPx) + drag.durationMin)}
                </div>
              )}
            </div>
          </div>
        ) : (
          unscheduled.length === 0 &&
          jobs.length > 0 && <p className="text-sm text-muted">Nothing scheduled with times yet.</p>
        )}

        {canSchedule && scheduled.length > 0 && (
          <p className="mt-3 text-xs text-muted">Drag a job to change its time (15-minute steps). Click to open it.</p>
        )}
      </div>
    </div>
  )
}
