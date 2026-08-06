import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/roles'
import { runChatAgent } from '@/lib/chat-agent'

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

  const body = (await request.json().catch(() => null)) as {
    message?: string
    tzOffsetMinutes?: number
    localDate?: string
  } | null

  const message = body?.message?.trim()
  if (!message) return Response.json({ error: 'Empty message' }, { status: 400 })
  if (message.length > 4000) return Response.json({ error: 'Message too long' }, { status: 400 })

  // Sent by the browser because the server cannot know it. Both are validated
  // rather than trusted — an offset beyond ±14h or a malformed date would end
  // up baked into stored shift times.
  const offset = body?.tzOffsetMinutes
  const tzOffsetMinutes =
    typeof offset === 'number' && Number.isFinite(offset) && Math.abs(offset) <= 14 * 60
      ? offset
      : 0

  const localDate =
    typeof body?.localDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.localDate)
      ? body.localDate
      : new Date().toISOString().slice(0, 10)

  const { reply } = await runChatAgent(supabase, profile, message, { tzOffsetMinutes, localDate })
  return Response.json({ reply })
}
