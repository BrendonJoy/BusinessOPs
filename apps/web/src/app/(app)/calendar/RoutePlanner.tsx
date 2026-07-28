'use client'

import { useState } from 'react'
import { parseRouteDate, planRoute, applyRoute, type RoutePlanResult } from './route-actions'

export default function RoutePlanner() {
  const [description, setDescription] = useState('')
  const [isPlanning, setIsPlanning] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [plan, setPlan] = useState<RoutePlanResult | null>(null)
  const [applied, setApplied] = useState(false)

  async function handlePlan() {
    if (!description.trim()) return
    setIsPlanning(true)
    setPlan(null)
    setApplied(false)

    const dateResult = await parseRouteDate(description)
    if (dateResult.error || !dateResult.date) {
      setPlan({ error: dateResult.error ?? "Couldn't work out a date." })
      setIsPlanning(false)
      return
    }

    const result = await planRoute(dateResult.date)
    setPlan(result)
    setIsPlanning(false)
  }

  async function handleApply() {
    if (!plan || 'error' in plan) return
    setIsApplying(true)
    await applyRoute(
      plan.stops.map((s) => ({
        jobId: s.jobId,
        startTime: s.suggestedStartTime,
        finishTime: s.suggestedFinishTime,
      }))
    )
    setIsApplying(false)
    setApplied(true)
  }

  return (
    <section className="mb-6 rounded-lg border border-surface-border p-4">
      <h2 className="mb-3 text-sm font-medium">AI route planner</h2>

      <div className="flex items-end gap-3">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder='e.g. "plan the most efficient route for my jobs on the 14th of August"'
          className="flex-1 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={handlePlan}
          disabled={isPlanning || !description.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          {isPlanning ? 'Planning…' : 'Plan route'}
        </button>
      </div>

      {plan && 'error' in plan && (
        <p className="mt-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{plan.error}</p>
      )}

      {plan && !('error' in plan) && (
        <div className="mt-4">
          <p className="mb-2 text-sm text-muted">
            Suggested order for {plan.date} — total travel time ~{plan.totalTravelMinutes} min
          </p>

          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="py-1 font-medium">#</th>
                <th className="py-1 font-medium">Job</th>
                <th className="py-1 font-medium">Customer</th>
                <th className="py-1 font-medium">Address</th>
                <th className="py-1 font-medium">Current time</th>
                <th className="py-1 font-medium">Suggested time</th>
                <th className="py-1 font-medium">Travel</th>
              </tr>
            </thead>
            <tbody>
              {plan.stops.map((stop, i) => (
                <tr key={stop.jobId} className="border-t border-surface-border">
                  <td className="py-1">{i + 1}</td>
                  <td className="py-1">{stop.jobNumber ?? '—'}</td>
                  <td className="py-1">{stop.customerName}</td>
                  <td className="py-1">{stop.addressLine}</td>
                  <td className="py-1">{stop.currentStartTime?.slice(0, 5) ?? '—'}</td>
                  <td className="py-1 font-medium">{stop.suggestedStartTime}</td>
                  <td className="py-1">
                    {i === 0
                      ? '—'
                      : stop.travelMinutesFromPrevious == null
                        ? 'no route found'
                        : `+${stop.travelMinutesFromPrevious} min`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {plan.skipped.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              Skipped (no geocoded address):{' '}
              {plan.skipped.map((s) => s.jobNumber ?? 'unknown').join(', ')}
            </p>
          )}

          {applied ? (
            <p className="mt-3 text-sm text-accent">Schedule updated.</p>
          ) : (
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={handleApply}
                disabled={isApplying}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
              >
                {isApplying ? 'Applying…' : 'Apply schedule'}
              </button>
              <button
                type="button"
                onClick={() => setPlan(null)}
                className="rounded-md border border-surface-border px-3 py-1.5 text-xs font-medium hover:border-accent"
              >
                Discard
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
