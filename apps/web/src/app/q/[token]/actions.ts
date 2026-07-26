'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const ERROR_MESSAGES: Record<string, string> = {
  invalid_status: 'Something went wrong. Please try again.',
  not_available: 'This quote has already been responded to, or has not been sent yet.',
}

export async function respondToQuote(token: string, status: 'accepted' | 'declined') {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('respond_to_quote', { p_token: token, p_status: status })

  if (error) {
    redirect(`/q/${token}?error=${encodeURIComponent(error.message)}`)
  }

  const rpcError = (data as { error?: string } | null)?.error
  if (rpcError) {
    redirect(`/q/${token}?error=${encodeURIComponent(ERROR_MESSAGES[rpcError] ?? rpcError)}`)
  }

  revalidatePath(`/q/${token}`)
}
