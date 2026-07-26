'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

function errorRedirect(jobId: string, message: string): never {
  redirect(`/jobs/${jobId}?error=${encodeURIComponent(message)}`)
}

export async function updateJob(jobId: string, formData: FormData) {
  const supabase = await createClient()

  const status = String(formData.get('status') ?? '')
  const addressLine = String(formData.get('address_line') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null
  const startDate = String(formData.get('start_date') ?? '') || null
  const finishDate = String(formData.get('finish_date') ?? '') || null

  const { error } = await supabase
    .from('jobs')
    .update({ status, address_line: addressLine, notes, start_date: startDate, finish_date: finishDate })
    .eq('id', jobId)

  if (error) errorRedirect(jobId, error.message)

  revalidatePath(`/jobs/${jobId}`)
  revalidatePath('/jobs')
}

export async function addCostEntry(jobId: string, formData: FormData) {
  const supabase = await createClient()

  const type = String(formData.get('type') ?? 'material')
  const description = String(formData.get('description') ?? '').trim()
  const quantity = Number(formData.get('quantity') ?? 0)
  const unitCost = Number(formData.get('unit_cost') ?? 0)

  if (!description) return

  const { error } = await supabase.from('cost_entries').insert({
    job_id: jobId,
    type,
    description,
    quantity,
    unit_cost: unitCost,
  })

  if (error) errorRedirect(jobId, error.message)

  revalidatePath(`/jobs/${jobId}`)
}

export async function deleteCostEntry(jobId: string, costEntryId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('cost_entries').delete().eq('id', costEntryId)
  if (error) errorRedirect(jobId, error.message)
  revalidatePath(`/jobs/${jobId}`)
}

export async function uploadJobFile(jobId: string, formData: FormData) {
  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return

  const supabase = await createClient()
  const path = `${jobId}/${crypto.randomUUID()}-${file.name}`

  const { error: uploadError } = await supabase.storage.from('job-files').upload(path, file)
  if (uploadError) errorRedirect(jobId, uploadError.message)

  const { error: insertError } = await supabase.from('job_files').insert({
    job_id: jobId,
    file_url: path,
    file_type: file.type || null,
  })

  if (insertError) errorRedirect(jobId, insertError.message)

  revalidatePath(`/jobs/${jobId}`)
}

export async function deleteJobFile(jobId: string, fileId: string, filePath: string) {
  const supabase = await createClient()
  const { error: removeError } = await supabase.storage.from('job-files').remove([filePath])
  if (removeError) errorRedirect(jobId, removeError.message)

  const { error: deleteError } = await supabase.from('job_files').delete().eq('id', fileId)
  if (deleteError) errorRedirect(jobId, deleteError.message)

  revalidatePath(`/jobs/${jobId}`)
}
