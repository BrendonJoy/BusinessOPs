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

  const body = (await request.json().catch(() => null)) as { message?: string } | null
  const message = body?.message?.trim()
  if (!message) return Response.json({ error: 'Empty message' }, { status: 400 })
  if (message.length > 4000) return Response.json({ error: 'Message too long' }, { status: 400 })

  const { reply } = await runChatAgent(supabase, profile, message)
  return Response.json({ reply })
}
