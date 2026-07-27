import type { FeedbackCategory } from '@trade-assist/db'

/** Parses a leading "@idea"/"@support" tag off a message. Defaults to "support" if untagged. */
export function parseFeedbackTag(text: string): { category: FeedbackCategory; message: string } {
  const trimmed = text.trim()
  const match = trimmed.match(/^@(idea|support)\b\s*/i)

  if (match) {
    return {
      category: match[1].toLowerCase() as FeedbackCategory,
      message: trimmed.slice(match[0].length).trim(),
    }
  }

  return { category: 'support', message: trimmed }
}
