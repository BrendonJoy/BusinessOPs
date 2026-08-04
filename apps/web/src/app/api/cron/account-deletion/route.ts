import { createAdminClient } from '@/lib/supabase/admin'
import { eraseExpiredAccounts } from '@/lib/account-erasure'

// Daily cron (see vercel.json): permanently erases accounts whose 30-day grace
// period has expired. Vercel invokes this with Authorization: Bearer $CRON_SECRET.
//
// Daily rather than weekly, unlike the retention purge. Here the delay is a
// promise made to the customer — "erased after 30 days" should not mean "up to
// 37 days" — and it is also the window in which they can still change their
// mind, so it should not silently stretch.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return Response.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  }

  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  if (!supabase) {
    return Response.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured' }, { status: 503 })
  }

  try {
    const erased = await eraseExpiredAccounts(supabase)
    // The response body is the only surviving record that an erasure happened —
    // once the company row is gone there is nothing left in the database to
    // point at. It lands in the platform logs, which is where the evidence for
    // "we did delete it, on this date" has to come from.
    return Response.json({ erasedCount: erased.length, erased })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
