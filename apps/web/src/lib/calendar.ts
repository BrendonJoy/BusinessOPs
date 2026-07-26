const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function formatDateYMD(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export type MonthInfo = {
  year: number
  month: number // 1-indexed
  monthParam: string // YYYY-MM
  label: string // e.g. "July 2026"
  start: string // YYYY-MM-DD, first day of month
  end: string // YYYY-MM-DD, last day of month
  prevMonthParam: string
  nextMonthParam: string
}

export function getMonthInfo(monthParam?: string): MonthInfo {
  const now = new Date()
  let year = now.getFullYear()
  let month = now.getMonth() + 1

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split('-').map(Number)
    year = y
    month = m
  }

  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 0)
  const prevDate = new Date(year, month - 2, 1)
  const nextDate = new Date(year, month, 1)

  const pad = (n: number) => String(n).padStart(2, '0')

  return {
    year,
    month,
    monthParam: `${year}-${pad(month)}`,
    label: `${MONTH_NAMES[month - 1]} ${year}`,
    start: formatDateYMD(monthStart),
    end: formatDateYMD(monthEnd),
    prevMonthParam: `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}`,
    nextMonthParam: `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}`,
  }
}

/** Full weeks of YYYY-MM-DD strings covering the given month, Sunday-first. */
export function getCalendarGridDays(year: number, month: number): string[] {
  const firstOfMonth = new Date(year, month - 1, 1)
  const lastOfMonth = new Date(year, month, 0)

  const gridStart = new Date(firstOfMonth)
  gridStart.setDate(gridStart.getDate() - gridStart.getDay())

  const gridEnd = new Date(lastOfMonth)
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()))

  const days: string[] = []
  const cursor = new Date(gridStart)
  while (cursor <= gridEnd) {
    days.push(formatDateYMD(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}
