'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logJobAudit } from '@/lib/audit'
import { getDistanceMatrix } from '@/lib/google-maps'
import { findBestRoute } from '@/lib/route-optimizer'

export type RouteStop = {
  jobId: string
  jobNumber: string | null
  customerName: string
  addressLine: string
  currentStartTime: string | null
  suggestedStartTime: string
  suggestedFinishTime: string
  travelMinutesFromPrevious: number | null
}

export type RoutePlanResult =
  | {
      date: string
      stops: RouteStop[]
      skipped: { jobNumber: string | null; reason: string }[]
      totalTravelMinutes: number
    }
  | { error: string }

type RouteJob = {
  id: string
  job_number: string | null
  address_line: string | null
  geo_lat: number | null
  geo_lng: number | null
  start_time: string | null
  finish_time: string | null
  customer: { name: string } | null
}

function durationMinutes(start: string | null, finish: string | null): number {
  if (!start || !finish) return 60
  const [sh, sm] = start.slice(0, 5).split(':').map(Number)
  const [fh, fm] = finish.slice(0, 5).split(':').map(Number)
  const diff = fh * 60 + fm - (sh * 60 + sm)
  return diff > 0 ? diff : 60
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = ((h * 60 + m + minutes) % (24 * 60) + 24 * 60) % (24 * 60)
  const newH = Math.floor(total / 60)
  const newM = total % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}

export async function planRoute(date: string): Promise<RoutePlanResult> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('jobs')
    .select(
      'id, job_number, address_line, geo_lat, geo_lng, start_time, finish_time, status, customer:customers(name)'
    )
    .eq('start_date', date)
    .neq('status', 'cancelled')

  if (error) return { error: error.message }

  const jobs = (data ?? []) as unknown as RouteJob[]

  if (jobs.length === 0) {
    return { error: `No jobs scheduled on ${date}.` }
  }

  const geocoded = jobs.filter((j) => j.geo_lat != null && j.geo_lng != null)
  const skipped = jobs
    .filter((j) => j.geo_lat == null || j.geo_lng == null)
    .map((j) => ({ jobNumber: j.job_number, reason: 'No geocoded address on file' }))

  if (geocoded.length < 2) {
    return {
      error: `Only ${geocoded.length} job(s) on ${date} have a geocoded address — need at least 2 to plan a route.`,
    }
  }

  const matrix = await getDistanceMatrix(geocoded.map((j) => ({ lat: j.geo_lat!, lng: j.geo_lng! })))
  if (!matrix) {
    return { error: 'Could not calculate travel times between jobs (Google Maps not configured?).' }
  }

  const { order, totalSeconds } = findBestRoute(matrix)

  const existingTimes = geocoded.map((j) => j.start_time).filter((t): t is string => Boolean(t))
  let currentTime = existingTimes.length > 0 ? existingTimes.sort()[0].slice(0, 5) : '08:00'

  const stops: RouteStop[] = []

  for (let i = 0; i < order.length; i++) {
    const idx = order[i]
    const job = geocoded[idx]
    let travelMinutes: number | null = 0

    if (i > 0) {
      const prevIdx = order[i - 1]
      const prevJob = geocoded[prevIdx]
      const rawSeconds = matrix[prevIdx][idx]
      travelMinutes = Number.isFinite(rawSeconds) ? Math.round(rawSeconds / 60) : null
      const prevDuration = durationMinutes(prevJob.start_time, prevJob.finish_time)
      currentTime = addMinutes(currentTime, prevDuration + (travelMinutes ?? 0))
    }

    stops.push({
      jobId: job.id,
      jobNumber: job.job_number,
      customerName: job.customer?.name ?? 'Customer',
      addressLine: job.address_line ?? '',
      currentStartTime: job.start_time,
      suggestedStartTime: currentTime,
      suggestedFinishTime: addMinutes(currentTime, durationMinutes(job.start_time, job.finish_time)),
      travelMinutesFromPrevious: travelMinutes,
    })
  }

  return { date, stops, skipped, totalTravelMinutes: Math.round(totalSeconds / 60) }
}

export async function applyRoute(
  updates: { jobId: string; startTime: string; finishTime: string }[]
) {
  const supabase = await createClient()

  for (const u of updates) {
    await supabase
      .from('jobs')
      .update({ start_time: u.startTime, finish_time: u.finishTime })
      .eq('id', u.jobId)
    await logJobAudit(supabase, u.jobId, `Rescheduled by AI route planner to ${u.startTime}`)
  }

  revalidatePath('/calendar')
  revalidatePath('/jobs')
}
