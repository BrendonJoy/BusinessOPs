import { createAdminClient } from '@/lib/supabase/admin'
import { runFeedbackDigest } from '@/lib/feedback-digest'
import { sendFeedbackDigestEmail } from '@/lib/email'

// Daily cron (see vercel.json): generates the AI feedback digest and emails
// it to every platform admin. Vercel invokes this with
// Authorization: Bearer $CRON_SECRET.
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

  const digest = await runFeedbackDigest(supabase)
  if (!digest) {
    return Response.json({ skipped: 'no new feedback' })
  }

  // platform_admins.user_id references auth.users, not profiles, so there's
  // no FK for a PostgREST embed -- resolve emails via profiles in a second query.
  const { data: adminRows } = await supabase.from('platform_admins').select('user_id')
  const adminIds = (adminRows ?? []).map((row) => row.user_id as string)

  const { data: profileRows } = adminIds.length
    ? await supabase.from('profiles').select('email').in('id', adminIds)
    : { data: [] }

  const recipients = (profileRows ?? [])
    .map((row) => row.email as string | null)
    .filter((email): email is string => Boolean(email))

  const date = new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })

  const sendResults = await Promise.all(
    recipients.map((to) =>
      sendFeedbackDigestEmail({
        to,
        date,
        messageCount: digest.messageCount,
        summary: digest.summary,
        urgentMessages: digest.urgentMessages,
        suggestedActions: digest.suggestedActions,
      })
    )
  )

  return Response.json({
    messageCount: digest.messageCount,
    urgentCount: digest.urgentItems.length,
    suggestedActionCount: digest.suggestedActions.length,
    emails: recipients.map((to, i) => ({ to, ...sendResults[i] })),
  })
}
