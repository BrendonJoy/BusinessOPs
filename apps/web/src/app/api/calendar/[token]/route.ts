import { createClient } from '@/lib/supabase/server'
import { buildIcsFeed, type CalendarFeedJob } from '@/lib/ics'

type FeedData = {
  company_name: string
  jobs: CalendarFeedJob[]
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()

  const { data } = await supabase.rpc('get_calendar_feed_data', { p_token: token })
  const result = data as unknown as FeedData | null

  if (!result) {
    return new Response(null, { status: 404 })
  }

  const ics = buildIcsFeed(result.company_name, result.jobs)

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="trade-assist.ics"',
      'Cache-Control': 'no-cache',
    },
  })
}
