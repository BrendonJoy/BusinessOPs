import { createAdminClient } from '@/lib/supabase/admin'
import { purgeExpiredData } from '@/lib/retention'

// Weekly cron (see vercel.json): deletes data that has passed its retention
// period. Vercel invokes this with Authorization: Bearer $CRON_SECRET.
//
// Weekly rather than daily because retention is measured in months — running it
// every day would be six extra wake-ups a week to delete nothing, and the
// difference between "purged within a day" and "within a week" does not change
// the compliance position.
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
    const result = await purgeExpiredData(supabase)
    return Response.json(result)
  } catch (error) {
    // Surfaced rather than swallowed: a retention job that fails quietly leaves
    // us stating a policy in the privacy notice that is not being enforced.
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
