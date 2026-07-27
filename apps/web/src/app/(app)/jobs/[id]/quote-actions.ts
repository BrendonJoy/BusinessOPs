'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logJobAudit } from '@/lib/audit'

function errorRedirect(jobId: string, message: string): never {
  redirect(`/jobs/${jobId}?error=${encodeURIComponent(message)}`)
}

export async function createQuote(jobId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('quotes').insert({ job_id: jobId })
  if (error) errorRedirect(jobId, error.message)
  await logJobAudit(supabase, jobId, 'Quote created')
  revalidatePath(`/jobs/${jobId}`)
}

export async function addQuoteLineItem(quoteId: string, jobId: string, formData: FormData) {
  const description = String(formData.get('description') ?? '').trim()
  const quantity = Number(formData.get('quantity') ?? 0)
  const unitPrice = Number(formData.get('unit_price') ?? 0)

  if (!description) return

  const supabase = await createClient()
  const { error } = await supabase.from('quote_line_items').insert({
    quote_id: quoteId,
    description,
    quantity,
    unit_price: unitPrice,
  })

  if (error) errorRedirect(jobId, error.message)

  await logJobAudit(supabase, jobId, `Added quote line item: ${description}`)

  revalidatePath(`/jobs/${jobId}`)
}

export async function addQuoteLineItemsBulk(
  quoteId: string,
  jobId: string,
  items: { description: string; quantity: number; unit_price: number }[]
) {
  if (items.length === 0) return

  const supabase = await createClient()
  const { error } = await supabase.from('quote_line_items').insert(
    items.map((item) => ({
      quote_id: quoteId,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
    }))
  )

  if (error) errorRedirect(jobId, error.message)

  await logJobAudit(supabase, jobId, `Added ${items.length} quote line item${items.length === 1 ? '' : 's'} via AI assistant`)

  revalidatePath(`/jobs/${jobId}`)
}

export async function deleteQuoteLineItem(itemId: string, jobId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('quote_line_items').delete().eq('id', itemId)
  if (error) errorRedirect(jobId, error.message)
  await logJobAudit(supabase, jobId, 'Removed quote line item')
  revalidatePath(`/jobs/${jobId}`)
}

export async function markQuoteSent(quoteId: string, jobId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('quotes')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', quoteId)
    .eq('status', 'draft')
  if (error) errorRedirect(jobId, error.message)
  await logJobAudit(supabase, jobId, 'Quote sent to customer')
  revalidatePath(`/jobs/${jobId}`)
}

export async function updateQuoteDeposit(quoteId: string, jobId: string, formData: FormData) {
  const depositPercent = Number(formData.get('deposit_percent') ?? 0)
  const supabase = await createClient()
  const { error } = await supabase
    .from('quotes')
    .update({ deposit_percent: depositPercent })
    .eq('id', quoteId)
  if (error) errorRedirect(jobId, error.message)
  await logJobAudit(supabase, jobId, `Quote deposit updated to ${depositPercent}%`)
  revalidatePath(`/jobs/${jobId}`)
}

export async function updateQuoteTaxRate(quoteId: string, jobId: string, formData: FormData) {
  const taxRate = Number(formData.get('tax_rate') ?? 0)
  const supabase = await createClient()
  const { error } = await supabase.from('quotes').update({ tax_rate: taxRate }).eq('id', quoteId)
  if (error) errorRedirect(jobId, error.message)
  await logJobAudit(supabase, jobId, `Quote tax rate updated to ${taxRate}%`)
  revalidatePath(`/jobs/${jobId}`)
}

// Only ever called for a non-draft quote (editing a draft in place is handled
// client-side by just opening the panel -- no version needed since nothing's
// been sent yet). Creates a new draft version and supersedes this one.
export async function createQuoteVersion(quoteId: string, jobId: string) {
  const supabase = await createClient()
  const { data: newQuoteId, error } = await supabase.rpc('create_quote_version', {
    p_quote_id: quoteId,
  })
  if (error) errorRedirect(jobId, error.message)

  await logJobAudit(supabase, jobId, 'Quote edited (new version created)')

  revalidatePath(`/jobs/${jobId}`)
  redirect(`/jobs/${jobId}?openQuote=${newQuoteId}`)
}
