'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logJobAudit } from '@/lib/audit'
import { getCompanyCurrency } from '@/lib/company'
import { parseReceipt, type ReceiptMediaType } from './ai-receipt-actions'

function errorRedirect(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`)
}

const RECEIPT_MEDIA_TYPES: ReceiptMediaType[] = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
]

function isReceiptMediaType(value: string): value is ReceiptMediaType {
  return (RECEIPT_MEDIA_TYPES as string[]).includes(value)
}

export async function uploadExpense(formData: FormData) {
  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return

  const supabase = await createClient()
  const { data: profile } = await supabase.from('profiles').select('company_id').single()
  if (!profile) errorRedirect('/expenses', 'Could not determine your company.')

  const path = `${profile.company_id}/${crypto.randomUUID()}-${file.name}`

  // Read the file once -- File/Blob from a Server Action's FormData can only
  // be safely consumed a single time, so the storage upload and the AI parse
  // both need to work from this same buffer rather than each calling
  // file.arrayBuffer() independently.
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from('expense-receipts')
    .upload(path, buffer, { contentType: file.type || undefined })
  if (uploadError) errorRedirect('/expenses', uploadError.message)

  let description = ''
  let amount = 0

  if (isReceiptMediaType(file.type)) {
    const parsed = await parseReceipt(buffer.toString('base64'), file.type)
    if (parsed.data) {
      description = parsed.data.description
      amount = parsed.data.amount
    }
  }

  const { error: insertError } = await supabase.from('expenses').insert({
    company_id: profile.company_id,
    file_path: path,
    file_type: file.type || null,
    description,
    amount,
  })

  if (insertError) errorRedirect('/expenses', insertError.message)

  revalidatePath('/expenses')
}

// Same as uploadExpense but pre-assigns job_id at insert time, for uploading
// a receipt directly from a job's Costs section (no job picker needed).
export async function uploadExpenseForJob(jobId: string, formData: FormData) {
  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return

  const jobPath = `/jobs/${jobId}`
  const supabase = await createClient()
  const { data: profile } = await supabase.from('profiles').select('company_id').single()
  if (!profile) errorRedirect(jobPath, 'Could not determine your company.')

  const path = `${profile.company_id}/${crypto.randomUUID()}-${file.name}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from('expense-receipts')
    .upload(path, buffer, { contentType: file.type || undefined })
  if (uploadError) errorRedirect(jobPath, uploadError.message)

  let description = ''
  let amount = 0

  if (isReceiptMediaType(file.type)) {
    const parsed = await parseReceipt(buffer.toString('base64'), file.type)
    if (parsed.data) {
      description = parsed.data.description
      amount = parsed.data.amount
    }
  }

  const { error: insertError } = await supabase.from('expenses').insert({
    company_id: profile.company_id,
    job_id: jobId,
    file_path: path,
    file_type: file.type || null,
    description,
    amount,
  })

  if (insertError) errorRedirect(jobPath, insertError.message)

  revalidatePath(jobPath)
}

export async function assignExpenseToJob(expenseId: string, formData: FormData) {
  const jobId = String(formData.get('job_id') ?? '')
  const type = String(formData.get('type') ?? 'material')
  const description = String(formData.get('description') ?? '').trim()
  const amountPaid = Number(formData.get('amount') ?? 0)
  const gstApplies = formData.get('gst_applies') === 'on'
  const redirectPath = jobId ? `/jobs/${jobId}` : '/expenses'

  if (!jobId || !description) {
    errorRedirect(redirectPath, 'Description and job are required to assign this expense.')
  }

  const supabase = await createClient()

  let unitCost = amountPaid
  if (gstApplies) {
    const { default_tax_rate } = await getCompanyCurrency(supabase)
    unitCost = Math.round((amountPaid / (1 + default_tax_rate / 100)) * 100) / 100
  }

  const { data: costEntry, error: costEntryError } = await supabase
    .from('cost_entries')
    .insert({ job_id: jobId, type, description, quantity: 1, unit_cost: unitCost })
    .select('id')
    .single()

  if (costEntryError) errorRedirect(redirectPath, costEntryError.message)

  const { error: updateError } = await supabase
    .from('expenses')
    .update({ job_id: jobId, cost_entry_id: costEntry.id })
    .eq('id', expenseId)

  if (updateError) errorRedirect(redirectPath, updateError.message)

  await logJobAudit(supabase, jobId, `Expense assigned as cost: ${description}`)

  revalidatePath('/expenses')
  revalidatePath(`/jobs/${jobId}`)
}

export async function deleteExpense(expenseId: string, filePath: string, jobId?: string) {
  const redirectPath = jobId ? `/jobs/${jobId}` : '/expenses'
  const supabase = await createClient()

  const { error: removeError } = await supabase.storage.from('expense-receipts').remove([filePath])
  if (removeError) errorRedirect(redirectPath, removeError.message)

  const { error: deleteError } = await supabase.from('expenses').delete().eq('id', expenseId)
  if (deleteError) errorRedirect(redirectPath, deleteError.message)

  revalidatePath('/expenses')
  if (jobId) revalidatePath(`/jobs/${jobId}`)
}
