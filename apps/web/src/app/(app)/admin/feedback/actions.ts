'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function updateFeedbackStatus(messageId: string, formData: FormData) {
  const status = String(formData.get('status') ?? '')
  if (!status) return

  const supabase = await createClient()
  await supabase.from('feedback_messages').update({ status }).eq('id', messageId)

  revalidatePath('/admin/feedback')
}
