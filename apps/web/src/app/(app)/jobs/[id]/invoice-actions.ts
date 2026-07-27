'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logJobAudit } from '@/lib/audit'
import { generateInvoicePdf } from '@/lib/invoice-pdf'
import { sendInvoiceEmail } from '@/lib/email'
import { formatMoney } from '@/lib/money'

function errorRedirect(jobId: string, message: string): never {
  redirect(`/jobs/${jobId}?error=${encodeURIComponent(message)}`)
}

export async function updateInvoiceStatus(invoiceId: string, jobId: string, formData: FormData) {
  const status = String(formData.get('status') ?? '')
  if (!status) return

  const updates: Record<string, unknown> = { status }
  if (status === 'sent') updates.sent_at = new Date().toISOString()

  const supabase = await createClient()
  const { error } = await supabase.from('invoices').update(updates).eq('id', invoiceId)
  if (error) errorRedirect(jobId, error.message)
  await logJobAudit(supabase, jobId, `Invoice status changed to ${status}`)

  if (status === 'sent' && process.env.RESEND_API_KEY) {
    const pdf = await generateInvoicePdf(invoiceId)
    if (pdf?.customerEmail) {
      const result = await sendInvoiceEmail({
        to: pdf.customerEmail,
        customerName: pdf.customerName,
        companyName: pdf.companyName,
        jobNumber: pdf.jobNumber,
        total: formatMoney(pdf.total, pdf.currency),
        pdfBuffer: pdf.buffer,
        pdfFilename: pdf.filename,
      })
      if (result.sent) {
        await logJobAudit(supabase, jobId, `Invoice emailed to ${pdf.customerEmail}`)
      } else if (result.reason === 'send_failed') {
        await logJobAudit(supabase, jobId, 'Invoice email failed to send')
      }
    }
  }

  revalidatePath(`/jobs/${jobId}`)
}

export async function updateInvoiceTaxRate(invoiceId: string, jobId: string, formData: FormData) {
  const taxRate = Number(formData.get('tax_rate') ?? 0)
  const supabase = await createClient()
  const { error } = await supabase.from('invoices').update({ tax_rate: taxRate }).eq('id', invoiceId)
  if (error) errorRedirect(jobId, error.message)
  await logJobAudit(supabase, jobId, `Invoice tax rate updated to ${taxRate}%`)
  revalidatePath(`/jobs/${jobId}`)
}

export async function createInvoice(jobId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('invoices').insert({ job_id: jobId })
  if (error) errorRedirect(jobId, error.message)
  await logJobAudit(supabase, jobId, 'Invoice created')
  revalidatePath(`/jobs/${jobId}`)
}

export async function addInvoiceLineItem(invoiceId: string, jobId: string, formData: FormData) {
  const description = String(formData.get('description') ?? '').trim()
  const quantity = Number(formData.get('quantity') ?? 0)
  const unitPrice = Number(formData.get('unit_price') ?? 0)

  if (!description) return

  const supabase = await createClient()
  const { error } = await supabase.from('invoice_line_items').insert({
    invoice_id: invoiceId,
    description,
    quantity,
    unit_price: unitPrice,
    source: 'manual',
  })

  if (error) errorRedirect(jobId, error.message)

  await logJobAudit(supabase, jobId, `Added invoice line item: ${description}`)

  revalidatePath(`/jobs/${jobId}`)
}

export async function addInvoiceLineItemsBulk(
  invoiceId: string,
  jobId: string,
  items: { description: string; quantity: number; unit_price: number }[]
) {
  if (items.length === 0) return

  const supabase = await createClient()
  const { error } = await supabase.from('invoice_line_items').insert(
    items.map((item) => ({
      invoice_id: invoiceId,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      source: 'manual' as const,
    }))
  )

  if (error) errorRedirect(jobId, error.message)

  await logJobAudit(supabase, jobId, `Added ${items.length} invoice line item${items.length === 1 ? '' : 's'} via AI assistant`)

  revalidatePath(`/jobs/${jobId}`)
}

export async function importCostEntry(invoiceId: string, jobId: string, costEntryId: string) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('import_cost_entry_to_invoice', {
    p_cost_entry_id: costEntryId,
    p_invoice_id: invoiceId,
  })
  if (error) errorRedirect(jobId, error.message)
  await logJobAudit(supabase, jobId, 'Cost entry added to invoice')
  revalidatePath(`/jobs/${jobId}`)
}

export async function removeInvoiceLineItem(lineItemId: string, jobId: string) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('remove_invoice_line_item', { p_line_item_id: lineItemId })
  if (error) errorRedirect(jobId, error.message)
  await logJobAudit(supabase, jobId, 'Removed invoice line item')
  revalidatePath(`/jobs/${jobId}`)
}

// Only ever called for a non-draft invoice (editing a draft in place is
// handled client-side by just opening the panel). Creates a new draft version
// and supersedes this one.
export async function createInvoiceVersion(invoiceId: string, jobId: string) {
  const supabase = await createClient()
  const { data: newInvoiceId, error } = await supabase.rpc('create_invoice_version', {
    p_invoice_id: invoiceId,
  })
  if (error) errorRedirect(jobId, error.message)

  await logJobAudit(supabase, jobId, 'Invoice edited (new version created)')

  revalidatePath(`/jobs/${jobId}`)
  redirect(`/jobs/${jobId}?openInvoice=${newInvoiceId}`)
}
