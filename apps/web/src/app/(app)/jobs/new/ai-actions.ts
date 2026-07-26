'use server'

import Anthropic from '@anthropic-ai/sdk'

export type ParsedJobDraft = {
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  address_line: string | null
  start_date: string | null
  finish_date: string | null
  notes: string | null
}

export async function parseJobDescription(
  text: string
): Promise<{ data?: ParsedJobDraft; error?: string }> {
  if (!text.trim()) {
    return { error: 'Describe the job first.' }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: 'AI parsing is not configured (missing ANTHROPIC_API_KEY).' }
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const today = new Date().toISOString().slice(0, 10)

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: `You extract structured job-booking details from a tradesperson's free-text note dictated in the field. Today's date is ${today}. Resolve relative dates ("tomorrow", "next Tuesday") to actual dates in YYYY-MM-DD format. If a specific time of day is mentioned (e.g. "3pm"), include it in notes since there is no separate time field. Leave any field as an empty string if it isn't mentioned in the text. Do not invent details that aren't present.`,
      tools: [
        {
          name: 'extract_job',
          description: "Extract structured job-booking fields from the owner's free-text note.",
          input_schema: {
            type: 'object',
            properties: {
              customer_name: { type: 'string', description: 'Customer name, or empty string.' },
              customer_phone: { type: 'string', description: 'Customer phone number, or empty string.' },
              customer_email: { type: 'string', description: 'Customer email, or empty string.' },
              address_line: { type: 'string', description: 'Job address, or empty string.' },
              start_date: { type: 'string', description: 'Resolved start date as YYYY-MM-DD, or empty string.' },
              finish_date: { type: 'string', description: 'Resolved finish date as YYYY-MM-DD, or empty string.' },
              notes: {
                type: 'string',
                description:
                  'Any remaining relevant detail: job description, time of day, special instructions, or empty string.',
              },
            },
            required: [
              'customer_name',
              'customer_phone',
              'customer_email',
              'address_line',
              'start_date',
              'finish_date',
              'notes',
            ],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'extract_job' },
      messages: [{ role: 'user', content: text }],
    })

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    )

    if (!toolUse) {
      return { error: "Couldn't parse that. Try rephrasing." }
    }

    const raw = toolUse.input as Record<string, string>
    const clean = (value: string | undefined) => {
      const trimmed = value?.trim()
      return trimmed ? trimmed : null
    }

    return {
      data: {
        customer_name: clean(raw.customer_name),
        customer_phone: clean(raw.customer_phone),
        customer_email: clean(raw.customer_email),
        address_line: clean(raw.address_line),
        start_date: clean(raw.start_date),
        finish_date: clean(raw.finish_date),
        notes: clean(raw.notes),
      },
    }
  } catch {
    return { error: 'AI parsing failed. Try again or fill in the form manually.' }
  }
}
