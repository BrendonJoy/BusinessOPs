export type CalendarFeedJob = {
  id: string
  job_number: string | null
  status: string
  address_line: string | null
  start_date: string
  start_time: string | null
  finish_date: string | null
  finish_time: string | null
  notes: string | null
  customer_name: string | null
  updated_at: string
}

function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function toDateCompact(dateStr: string): string {
  return dateStr.replace(/-/g, '')
}

function toTimeCompact(timeStr: string): string {
  return timeStr.replace(/:/g, '').slice(0, 6)
}

function addOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatDtstamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

export function buildIcsFeed(companyName: string, jobs: CalendarFeedJob[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Trade Assist//Calendar Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(`Trade Assist - ${companyName}`)}`,
  ]

  for (const job of jobs) {
    const summary = escapeText(`${job.job_number ?? 'Job'} - ${job.customer_name ?? 'Customer'}`)

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${job.id}@tradeassist`)
    lines.push(`DTSTAMP:${formatDtstamp(job.updated_at)}`)

    if (job.start_time) {
      const finishDate = job.finish_date ?? job.start_date
      const finishTime = job.finish_time ?? job.start_time
      lines.push(`DTSTART:${toDateCompact(job.start_date)}T${toTimeCompact(job.start_time)}`)
      lines.push(`DTEND:${toDateCompact(finishDate)}T${toTimeCompact(finishTime)}`)
    } else {
      const lastDay = job.finish_date && job.finish_date > job.start_date ? job.finish_date : job.start_date
      lines.push(`DTSTART;VALUE=DATE:${toDateCompact(job.start_date)}`)
      lines.push(`DTEND;VALUE=DATE:${toDateCompact(addOneDay(lastDay))}`)
    }

    lines.push(`SUMMARY:${summary}`)
    if (job.address_line) lines.push(`LOCATION:${escapeText(job.address_line)}`)
    if (job.notes) lines.push(`DESCRIPTION:${escapeText(job.notes)}`)
    lines.push('STATUS:CONFIRMED')
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}
