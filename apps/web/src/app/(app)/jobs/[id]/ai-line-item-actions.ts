'use server'

import Anthropic from '@anthropic-ai/sdk'
import type { LineItemType } from '@trade-assist/db'

export type ParsedLineItem = {
  description: string
  quantity: number
  unit_price: number
  item_type: LineItemType
}

const VALID_TYPES: LineItemType[] = ['labour', 'material', 'callout', 'other']

export async function parseLineItems(
  text: string
): Promise<{ data?: ParsedLineItem[]; error?: string }> {
  if (!text.trim()) {
    return { error: 'Describe the items first.' }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: 'AI parsing is not configured (missing ANTHROPIC_API_KEY).' }
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:
        "You extract billable line items (materials, labour, fees) from a tradesperson's free-text note dictated in the field. Each item needs a short description, a quantity (hours for labour, otherwise usually 1), a unit price in dollars, and a type: 'labour' for hourly work, 'material' for physical materials/parts, 'callout' for a flat call-out or service fee, or 'other' if it doesn't clearly fit those. If a dollar amount isn't stated for an item, set unit_price to 0 rather than guessing -- never invent a price. Split distinct items apart rather than merging them into one line.",
      tools: [
        {
          name: 'extract_line_items',
          description: "Extract structured billable line items from the owner's free-text note.",
          input_schema: {
            type: 'object',
            properties: {
              line_items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    description: { type: 'string', description: 'Short description of the item.' },
                    quantity: { type: 'number', description: 'Quantity or hours. Default 1 if unclear.' },
                    unit_price: {
                      type: 'number',
                      description: 'Unit price in dollars. 0 if not stated -- never guess.',
                    },
                    item_type: {
                      type: 'string',
                      enum: ['labour', 'material', 'callout', 'other'],
                      description: 'Category of this item.',
                    },
                  },
                  required: ['description', 'quantity', 'unit_price', 'item_type'],
                },
              },
            },
            required: ['line_items'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'extract_line_items' },
      messages: [{ role: 'user', content: text }],
    })

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    )

    if (!toolUse) {
      return { error: "Couldn't parse that. Try rephrasing." }
    }

    const raw = toolUse.input as { line_items?: Array<Record<string, unknown>> }
    const items = (raw.line_items ?? [])
      .map((item) => ({
        description: String(item.description ?? '').trim(),
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unit_price) || 0,
        item_type: (VALID_TYPES.includes(item.item_type as LineItemType)
          ? item.item_type
          : 'other') as LineItemType,
      }))
      .filter((item) => item.description)

    if (items.length === 0) {
      return { error: "Couldn't find any billable items in that. Try rephrasing." }
    }

    return { data: items }
  } catch {
    return { error: 'AI parsing failed. Try again or add items manually.' }
  }
}
