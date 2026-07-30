'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'

function errorRedirect(message: string): never {
  redirect(`/timesheet/approvals?error=${encodeURIComponent(message)}`)
}

async function requireCompany() {
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile) redirect('/login')
  if (!isCompanyAccount(profile.role)) redirect('/timesheet')
  return { supabase, profile }
}

function parseHHMM(raw: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw)
  if (!match) return null
  return { hours: Number(match[1]), minutes: Number(match[2]) }
}

function withTime(base: Date, time: { hours: number; minutes: number }): Date {
  const d = new Date(base)
  d.setHours(time.hours, time.minutes, 0, 0)
  return d
}

async function assertDayEditable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dayId: string | null
) {
  if (!dayId) return
  const { data: day } = await supabase.from('timesheet_days').select('status').eq('id', dayId).maybeSingle()
  if (day?.status === 'approved') {
    errorRedirect('This day has already been approved and can no longer be edited.')
  }
}

export async function updateEntryTimes(entryId: string, formData: FormData) {
  const { supabase } = await requireCompany()

  const clockInTime = parseHHMM(String(formData.get('clock_in_time') ?? ''))
  const clockOutTime = parseHHMM(String(formData.get('clock_out_time') ?? ''))
  if (!clockInTime || !clockOutTime) errorRedirect('Enter valid times.')

  const { data: entry } = await supabase
    .from('timesheet_entries')
    .select('id, clock_in, clock_out, day_id, cost_entry_id')
    .eq('id', entryId)
    .maybeSingle()

  if (!entry) errorRedirect('Timesheet entry not found.')

  await assertDayEditable(supabase, entry.day_id)

  // Times replace the time-of-day on the entry's existing dates.
  const newClockIn = withTime(new Date(entry.clock_in), clockInTime)
  const newClockOut = withTime(new Date(entry.clock_out ?? entry.clock_in), clockOutTime)

  if (newClockOut <= newClockIn) errorRedirect('Finish time must be after the start time.')

  const { error } = await supabase
    .from('timesheet_entries')
    .update({ clock_in: newClockIn.toISOString(), clock_out: newClockOut.toISOString() })
    .eq('id', entryId)

  if (error) errorRedirect(error.message)

  // Keep the auto-created labour cost entry in sync with the corrected hours.
  if (entry.cost_entry_id) {
    const hours = Math.round(((newClockOut.getTime() - newClockIn.getTime()) / 3600000) * 100) / 100
    await supabase.from('cost_entries').update({ quantity: hours }).eq('id', entry.cost_entry_id)
  }

  revalidatePath('/timesheet/approvals')
}

export async function deleteTimesheetEntry(entryId: string) {
  const { supabase } = await requireCompany()

  const { data: entry } = await supabase
    .from('timesheet_entries')
    .select('id, day_id, cost_entry_id')
    .eq('id', entryId)
    .maybeSingle()

  if (!entry) errorRedirect('Timesheet entry not found.')

  await assertDayEditable(supabase, entry.day_id)

  const { error } = await supabase.from('timesheet_entries').delete().eq('id', entryId)
  if (error) errorRedirect(error.message)

  // Best-effort: remove the linked labour cost entry too (skipped if it's
  // already referenced by an invoice line, in which case the delete fails).
  if (entry.cost_entry_id) {
    await supabase.from('cost_entries').delete().eq('id', entry.cost_entry_id)
  }

  revalidatePath('/timesheet/approvals')
}

export async function approveDay(dayId: string) {
  const { supabase, profile } = await requireCompany()

  const { error } = await supabase
    .from('timesheet_days')
    .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: profile.id })
    .eq('id', dayId)
    .eq('status', 'submitted')

  if (error) errorRedirect(error.message)

  revalidatePath('/timesheet/approvals')
  revalidatePath('/timesheet/payroll')
}

export async function approvePayrollPeriod(formData: FormData) {
  const { supabase, profile } = await requireCompany()

  const periodStart = String(formData.get('period_start') ?? '')
  const periodEnd = String(formData.get('period_end') ?? '')

  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    redirect('/timesheet/payroll?error=Invalid%20period.')
  }

  const { error } = await supabase.from('payroll_periods').insert({
    company_id: profile.company_id,
    period_start: periodStart,
    period_end: periodEnd,
    approved_by: profile.id,
  })

  if (error && error.code !== '23505') {
    redirect(`/timesheet/payroll?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/timesheet/payroll')
  redirect(`/timesheet/payroll?from=${periodStart}&to=${periodEnd}`)
}
