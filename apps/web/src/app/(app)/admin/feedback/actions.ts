'use server'

import Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function updateFeedbackStatus(messageId: string, formData: FormData) {
  const status = String(formData.get('status') ?? '')
  if (!status) return

  const supabase = await createClient()
  await supabase.from('feedback_messages').update({ status }).eq('id', messageId)

  revalidatePath('/admin/feedback')
}

type DigestMessage = {
  id: string
  category: string
  message: string
  company: { name: string } | null
}

export async function generateFeedbackDigest() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('feedback_messages')
    .select('id, category, message, company:companies(name)')
    .eq('status', 'new')
    .order('created_at', { ascending: true })

  const messages = (data ?? []) as unknown as DigestMessage[]

  if (messages.length === 0) return

  if (!process.env.ANTHROPIC_API_KEY) {
    await supabase.from('feedback_digests').insert({
      message_count: messages.length,
      summary: `${messages.length} new message(s) received (AI summarization not configured).`,
      urgent_items: [],
    })
    revalidatePath('/admin/feedback')
    return
  }

  const messageBlock = messages
    .map((m) => `[id: ${m.id}] (${m.category}, from ${m.company?.name ?? 'unknown company'}): ${m.message}`)
    .join('\n\n')

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:
        'You summarize a batch of user feedback messages for the founder of a software product, Trade Assist. Each message includes its id, category (idea or support), the company that sent it, and the message text. Produce a short narrative summary (2-4 sentences) of themes and patterns across all the messages. Also identify any messages describing something urgent -- broken functionality blocking someone\'s work, data loss risk, or a serious complaint -- and return their id with a short reason. Most feedback is NOT urgent; only flag genuinely pressing issues.',
      tools: [
        {
          name: 'summarize_feedback',
          description: 'Return a narrative summary and any urgent items from the feedback batch.',
          input_schema: {
            type: 'object',
            properties: {
              summary: { type: 'string', description: '2-4 sentence narrative summary of themes and patterns.' },
              urgent_items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    message_id: { type: 'string' },
                    reason: { type: 'string' },
                  },
                  required: ['message_id', 'reason'],
                },
                description: 'Only genuinely urgent messages. Most feedback should not appear here.',
              },
            },
            required: ['summary', 'urgent_items'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'summarize_feedback' },
      messages: [{ role: 'user', content: messageBlock }],
    })

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    )

    const raw = (toolUse?.input as { summary?: string; urgent_items?: { message_id: string; reason: string }[] }) ?? {}

    await supabase.from('feedback_digests').insert({
      message_count: messages.length,
      summary: raw.summary ?? `${messages.length} new message(s) received.`,
      urgent_items: raw.urgent_items ?? [],
    })
  } catch {
    await supabase.from('feedback_digests').insert({
      message_count: messages.length,
      summary: `${messages.length} new message(s) received (AI summarization failed).`,
      urgent_items: [],
    })
  }

  await supabase
    .from('feedback_messages')
    .update({ status: 'read' })
    .in(
      'id',
      messages.map((m) => m.id)
    )

  revalidatePath('/admin/feedback')
}
