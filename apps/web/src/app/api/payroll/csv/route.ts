import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile, isCompanyAccount } from '@/lib/roles'
import { getPayrollReport } from '@/lib/payroll'

function csvCell(value: string | number): string {
  const text = String(value)
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile || !isCompanyAccount(profile.role)) {
    return new Response(null, { status: 403 })
  }

  const url = new URL(request.url)
  const from = url.searchParams.get('from') ?? ''
  const to = url.searchParams.get('to') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return new Response('Invalid period', { status: 400 })
  }

  const staffRows = await getPayrollReport(supabase, from, to)

  const lines: string[] = []
  lines.push(['Staff', 'Date', 'Clock in', 'Clock out', 'Hours', 'Job / category', 'Day status', 'Rate', 'Pay'].join(','))

  for (const staff of staffRows) {
    for (const entry of staff.entries) {
      lines.push(
        [
          csvCell(staff.staffName),
          entry.workDate,
          formatTime(entry.clockIn),
          entry.clockOut ? formatTime(entry.clockOut) : '',
          entry.hours.toFixed(2),
          csvCell(entry.target),
          entry.dayStatus,
          staff.rate !== null ? staff.rate.toFixed(2) : '',
          staff.rate !== null ? (entry.hours * staff.rate).toFixed(2) : '',
        ].join(',')
      )
    }
    lines.push(
      [
        csvCell(`${staff.staffName} total`),
        '',
        '',
        '',
        staff.totalHours.toFixed(2),
        '',
        '',
        staff.rate !== null ? staff.rate.toFixed(2) : '',
        staff.totalPay !== null ? staff.totalPay.toFixed(2) : '',
      ].join(',')
    )
  }

  const grandHours = staffRows.reduce((sum, s) => sum + s.totalHours, 0)
  const grandPay = staffRows.reduce((sum, s) => sum + (s.totalPay ?? 0), 0)
  lines.push(['Total', '', '', '', grandHours.toFixed(2), '', '', '', grandPay.toFixed(2)].join(','))

  return new Response(lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="payroll-${from}-to-${to}.csv"`,
    },
  })
}
