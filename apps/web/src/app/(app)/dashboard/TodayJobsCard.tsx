'use client'

import { useState } from 'react'
import type { JobWithCustomer } from '@/lib/jobs'
import DayView from '../calendar/DayView'
import { cardClasses } from '@/components/ui'

export default function TodayJobsCard({
  today,
  jobs,
}: {
  today: string
  jobs: JobWithCustomer[]
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cardClasses('text-left transition-colors hover:border-accent')}
      >
        <p className="text-2xl font-semibold">{jobs.length}</p>
        <p className="text-xs text-muted">Jobs Today</p>
      </button>

      {isOpen && <DayView day={today} jobs={jobs} canSchedule onClose={() => setIsOpen(false)} />}
    </>
  )
}
