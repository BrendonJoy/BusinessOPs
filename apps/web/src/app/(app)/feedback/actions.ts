'use server'

import Anthropic from '@anthropic-ai/sdk'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { parseFeedbackTag } from '@/lib/feedback'

async function summarize(message: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      system:
        'Summarize the following user feedback in one short, neutral sentence for an internal admin dashboard.',
      messages: [{ role: 'user', content: message }],
    })

    const block = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
    return block?.text.trim() ?? null
  } catch {
    return null
  }
}

export async function submitFeedback(formData: FormData) {
  const raw = String(formData.get('message') ?? '').trim()

  if (!raw) {
    redirect(`/feedback?error=${encodeURIComponent('Write a message first.')}`)
  }

  const { category, message } = parseFeedbackTag(raw)

  if (!message) {
    redirect(`/feedback?error=${encodeURIComponent('Add some detail after the tag.')}`)
  }

  const supabase = await createClient()

  const { data: profile } = await supabase.from('profiles').select('company_id').single()
  if (!profile) {
    redirect(`/feedback?error=${encodeURIComponent('Could not determine your company.')}`)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const aiSummary = await summarize(message)

  const { error } = await supabase.from('feedback_messages').insert({
    company_id: profile!.company_id,
    user_id: user?.id ?? null,
    category,
    message,
    ai_summary: aiSummary,
  })

  if (error) {
    redirect(`/feedback?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/feedback')
  redirect('/feedback?success=1')
}
