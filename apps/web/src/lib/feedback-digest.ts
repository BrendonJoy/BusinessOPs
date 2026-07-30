import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

// Works with either the session-based server client (admin page button) or
// the service-role client (daily cron) -- both expose the same query API.
type AnySupabaseClient = Pick<SupabaseClient, 'from'>

type DigestMessage = {
  id: string
  category: string
  message: string
  company: { name: string } | null
}

export type UrgentItem = { message_id: string; reason: string }
export type SuggestedAction = { title: string; suggestion: string }

export type DigestResult = {
  messageCount: number
  summary: string
  urgentItems: UrgentItem[]
  suggestedActions: SuggestedAction[]
  // Urgent items joined back to their message text/company for the email.
  urgentMessages: { reason: string; category: string; message: string; companyName: string }[]
}

export async function runFeedbackDigest(supabase: AnySupabaseClient): Promise<DigestResult | null> {
  const { data } = await supabase
    .from('feedback_messages')
    .select('id, category, message, company:companies(name)')
    .eq('status', 'new')
    .order('created_at', { ascending: true })

  const messages = (data ?? []) as unknown as DigestMessage[]

  if (messages.length === 0) return null

  let summary = `${messages.length} new message(s) received.`
  let urgentItems: UrgentItem[] = []
  let suggestedActions: SuggestedAction[] = []

  if (!process.env.ANTHROPIC_API_KEY) {
    summary = `${messages.length} new message(s) received (AI summarization not configured).`
  } else {
    const messageBlock = messages
      .map((m) => `[id: ${m.id}] (${m.category}, from ${m.company?.name ?? 'unknown company'}): ${m.message}`)
      .join('\n\n')

    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system:
          'You summarize a batch of user feedback messages for the founder of a software product, BusinessOps. Each message includes its id, category (idea or support), the company that sent it, and the message text. Produce a short narrative summary (2-4 sentences) of themes and patterns across all the messages. Identify any messages describing something urgent -- broken functionality blocking someone\'s work, data loss risk, or a serious complaint -- and return their id with a short reason. Most feedback is NOT urgent; only flag genuinely pressing issues. Finally, produce a short list of suggested actions: concrete, actionable fixes or improvements the founder could put on the development backlog, grouped by theme (one action can cover several related messages). Base suggestions strictly on what the messages describe -- do not invent features nobody asked about.',
        tools: [
          {
            name: 'summarize_feedback',
            description: 'Return a narrative summary, urgent items, and suggested actions from the feedback batch.',
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
                suggested_actions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string', description: 'Short action title, e.g. "Fix quote save button on mobile".' },
                      suggestion: { type: 'string', description: '1-2 sentences on what to do and why, referencing the feedback.' },
                    },
                    required: ['title', 'suggestion'],
                  },
                  description: 'Concrete backlog-ready actions grounded in the messages.',
                },
              },
              required: ['summary', 'urgent_items', 'suggested_actions'],
            },
          },
        ],
        tool_choice: { type: 'tool', name: 'summarize_feedback' },
        messages: [{ role: 'user', content: messageBlock }],
      })

      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      )

      const raw =
        (toolUse?.input as {
          summary?: string
          urgent_items?: UrgentItem[]
          suggested_actions?: SuggestedAction[]
        }) ?? {}

      summary = raw.summary ?? summary
      urgentItems = raw.urgent_items ?? []
      suggestedActions = raw.suggested_actions ?? []
    } catch {
      summary = `${messages.length} new message(s) received (AI summarization failed).`
    }
  }

  await supabase.from('feedback_digests').insert({
    message_count: messages.length,
    summary,
    urgent_items: urgentItems,
    suggested_actions: suggestedActions,
  })

  await supabase
    .from('feedback_messages')
    .update({ status: 'read' })
    .in(
      'id',
      messages.map((m) => m.id)
    )

  const byId = new Map(messages.map((m) => [m.id, m]))
  const urgentMessages = urgentItems.flatMap((item) => {
    const message = byId.get(item.message_id)
    if (!message) return []
    return [
      {
        reason: item.reason,
        category: message.category,
        message: message.message,
        companyName: message.company?.name ?? 'unknown company',
      },
    ]
  })

  return {
    messageCount: messages.length,
    summary,
    urgentItems,
    suggestedActions,
    urgentMessages,
  }
}
