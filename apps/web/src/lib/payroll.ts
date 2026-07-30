import type { createClient } from '@/lib/supabase/server'
import { TIMESHEET_MISC_CATEGORY_LABELS, type PayCycleLength, type TimesheetDayStatus, type TimesheetMiscCategory } from '@trade-assist/db'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export type PayCycle = { start: string; end: string } // inclusive YYYY-MM-DD bounds

// All cycle math is done in UTC on plain YYYY-MM-DD strings so results are
// identical regardless of the server's timezone.
function toUTC(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function toYMD(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(ymd: string, days: number): string {
  const d = toUTC(ymd)
  d.setUTCDate(d.getUTCDate() + days)
  return toYMD(d)
}

function addMonths(ymd: string, months: number): string {
  const d = toUTC(ymd)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, daysInMonth))
  return toYMD(d)
}

// Default anchor when the company hasn't configured one: the most recent Monday.
export function defaultAnchor(refDate: string): string {
  const d = toUTC(refDate)
  const isoDay = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
  return addDays(refDate, -(isoDay - 1))
}

// The cycle containing refDate, walking forward/backward from the anchor.
export function getCycleContaining(length: PayCycleLength, anchor: string, refDate: string): PayCycle {
  let start = anchor

  if (length === 'monthly') {
    let months = 0
    if (refDate >= anchor) {
      while (addMonths(anchor, months + 1) <= refDate) months += 1
    } else {
      while (addMonths(anchor, months) > refDate) months -= 1
    }
    start = addMonths(anchor, months)
    return { start, end: addDays(addMonths(anchor, months + 1), -1) }
  }

  const cycleDays = length === 'weekly' ? 7 : 14
  const diff = Math.floor((toUTC(refDate).getTime() - toUTC(anchor).getTime()) / 86400000)
  const cycles = Math.floor(diff / cycleDays)
  start = addDays(anchor, cycles * cycleDays)
  return { start, end: addDays(start, cycleDays - 1) }
}

// Most recent `count` cycles, newest (the one containing refDate) first.
export function listRecentCycles(
  length: PayCycleLength,
  anchor: string | null,
  refDate: string,
  count: number
): PayCycle[] {
  const resolvedAnchor = anchor ?? defaultAnchor(refDate)
  const cycles: PayCycle[] = []
  let cycle = getCycleContaining(length, resolvedAnchor, refDate)

  for (let i = 0; i < count; i++) {
    cycles.push(cycle)
    const prevEnd = addDays(cycle.start, -1)
    cycle = getCycleContaining(length, resolvedAnchor, prevEnd)
  }

  return cycles
}

export type PayrollEntryStatus = TimesheetDayStatus | 'unsubmitted'

export type PayrollEntry = {
  id: string
  workDate: string
  clockIn: string
  clockOut: string | null
  target: string
  hours: number
  dayStatus: PayrollEntryStatus
}

export type StaffPayroll = {
  profileId: string
  staffName: string
  rate: number | null
  totalHours: number
  totalPay: number | null
  unsubmittedCount: number
  unapprovedCount: number
  entries: PayrollEntry[]
}

type EntryRow = {
  id: string
  profile_id: string
  job_id: string | null
  misc_category: TimesheetMiscCategory | null
  clock_in: string
  clock_out: string | null
  day_id: string | null
  profile: { full_name: string | null; email: string } | null
  job: { job_number: string | null } | null
}

type DayRow = { id: string; profile_id: string; work_date: string; status: TimesheetDayStatus }

function localYMD(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Fetches and aggregates everything the payroll page, CSV, and PDF share.
// Period membership: entries submitted into a timesheet_days row go by that
// row's work_date; unsubmitted entries fall back to the local date of clock_in.
export async function getPayrollReport(
  supabase: SupabaseClient,
  from: string,
  to: string
): Promise<StaffPayroll[]> {
  const [{ data: daysData }, { data: entriesData }, { data: ratesData }] = await Promise.all([
    supabase
      .from('timesheet_days')
      .select('id, profile_id, work_date, status')
      .gte('work_date', from)
      .lte('work_date', to),
    supabase
      .from('timesheet_entries')
      .select(
        'id, profile_id, job_id, misc_category, clock_in, clock_out, day_id, profile:profiles(full_name, email), job:jobs(job_number)'
      )
      .gte('clock_in', `${addDays(from, -1)}T00:00:00`)
      .lte('clock_in', `${addDays(to, 1)}T23:59:59`)
      .order('clock_in', { ascending: true }),
    supabase.from('staff_pay_rates').select('profile_id, pay_rate'),
  ])

  const days = new Map<string, DayRow>()
  for (const d of (daysData ?? []) as DayRow[]) days.set(d.id, d)

  const rates = new Map<string, number>()
  for (const r of (ratesData ?? []) as { profile_id: string; pay_rate: number }[]) {
    rates.set(r.profile_id, Number(r.pay_rate))
  }

  const byStaff = new Map<string, StaffPayroll>()

  for (const entry of (entriesData ?? []) as unknown as EntryRow[]) {
    let workDate: string
    let dayStatus: PayrollEntryStatus

    const day = entry.day_id ? days.get(entry.day_id) : undefined
    if (day) {
      workDate = day.work_date
      dayStatus = day.status
    } else {
      workDate = localYMD(entry.clock_in)
      dayStatus = 'unsubmitted'
    }

    if (workDate < from || workDate > to) continue

    const hours = entry.clock_out
      ? (new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 3600000
      : 0

    const staff = byStaff.get(entry.profile_id) ?? {
      profileId: entry.profile_id,
      staffName: entry.profile?.full_name ?? entry.profile?.email ?? 'Unknown',
      rate: rates.get(entry.profile_id) ?? null,
      totalHours: 0,
      totalPay: null,
      unsubmittedCount: 0,
      unapprovedCount: 0,
      entries: [],
    }

    staff.totalHours += hours
    if (dayStatus === 'unsubmitted') staff.unsubmittedCount += 1
    if (dayStatus === 'submitted') staff.unapprovedCount += 1

    staff.entries.push({
      id: entry.id,
      workDate,
      clockIn: entry.clock_in,
      clockOut: entry.clock_out,
      target: entry.job_id
        ? (entry.job?.job_number ?? 'Job')
        : TIMESHEET_MISC_CATEGORY_LABELS[entry.misc_category!],
      hours,
      dayStatus,
    })

    byStaff.set(entry.profile_id, staff)
  }

  const result = Array.from(byStaff.values())
  for (const staff of result) {
    staff.totalPay = staff.rate !== null ? staff.totalHours * staff.rate : null
  }

  return result.sort((a, b) => a.staffName.localeCompare(b.staffName))
}
