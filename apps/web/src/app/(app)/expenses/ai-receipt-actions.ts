'use server'

import Anthropic from '@anthropic-ai/sdk'

export type ReceiptMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'application/pdf'

export type ParsedReceipt = {
  description: string
  amount: number
}

export async function parseReceipt(
  base64Data: string,
  mediaType: ReceiptMediaType
): Promise<{ data?: ParsedReceipt; error?: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: 'AI parsing is not configured (missing ANTHROPIC_API_KEY).' }
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const receiptBlock: Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam =
    mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } }

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:
        "You extract the vendor/item description and total amount from a tradesperson's uploaded receipt or invoice. If the total amount isn't clearly legible, return 0 rather than guessing -- never invent a figure.",
      tools: [
        {
          name: 'extract_receipt',
          description: "Extract the description and total amount from the receipt.",
          input_schema: {
            type: 'object',
            properties: {
              description: {
                type: 'string',
                description: 'Short description, e.g. vendor name and/or what was purchased.',
              },
              amount: {
                type: 'number',
                description: 'Total amount in dollars. 0 if not clearly legible -- never guess.',
              },
            },
            required: ['description', 'amount'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'extract_receipt' },
      messages: [{ role: 'user', content: [receiptBlock, { type: 'text', text: 'Extract this receipt.' }] }],
    })

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    )

    if (!toolUse) {
      return { error: "Couldn't read that receipt." }
    }

    const raw = toolUse.input as { description?: unknown; amount?: unknown }

    return {
      data: {
        description: String(raw.description ?? '').trim(),
        amount: Number(raw.amount) || 0,
      },
    }
  } catch {
    return { error: 'AI parsing failed.' }
  }
}
