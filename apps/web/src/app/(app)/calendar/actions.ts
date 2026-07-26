'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { formatDateYMD } from '@/lib/calendar'

function parseYMD(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export async function rescheduleJob(
  jobId: string,
  oldStartDate: string,
  newStartDate: string,
  finishDate: string | null
) {
  if (oldStartDate === newStartDate) return

  const deltaDays = Math.round(
    (parseYMD(newStartDate).getTime() - parseYMD(oldStartDate).getTime()) / (24 * 60 * 60 * 1000)
  )

  const updates: Record<string, string> = { start_date: newStartDate }
  if (finishDate) {
    const shiftedFinish = parseYMD(finishDate)
    shiftedFinish.setDate(shiftedFinish.getDate() + deltaDays)
    updates.finish_date = formatDateYMD(shiftedFinish)
  }

  const supabase = await createClient()
  await supabase.from('jobs').update(updates).eq('id', jobId)

  revalidatePath('/calendar')
  revalidatePath('/jobs')
  revalidatePath(`/jobs/${jobId}`)
}
