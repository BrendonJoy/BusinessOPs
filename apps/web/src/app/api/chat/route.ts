import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/roles'
import { runChatAgent } from '@/lib/chat-agent'
import { getCompanyTimezone } from '@/lib/company'
import { todayInZone } from '@/lib/timezone'

export async function GET() {
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(50)

  return Response.json({ messages: (data ?? []).reverse() })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { message?: string } | null

  const message = body?.message?.trim()
  if (!message) return Response.json({ error: 'Empty message' }, { status: 400 })
  if (message.length > 4000) return Response.json({ error: 'Message too long' }, { status: 400 })

  /*
   * The clock comes from the company record, not from the browser.
   *
   * It used to be an offset and a date the client posted, which had to be
   * validated as untrusted input and was the wrong answer anyway: a manager
   * messaging the assistant from another country would have "tomorrow" and
   * "6pm" resolved against their own clock rather than the venue's.
   */
  const zone = await getCompanyTimezone(supabase)
  const { reply } = await runChatAgent(supabase, profile, message, {
    zone,
    localDate: todayInZone(zone),
  })
  return Response.json({ reply })
}
