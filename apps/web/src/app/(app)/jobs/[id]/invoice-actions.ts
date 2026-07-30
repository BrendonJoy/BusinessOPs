'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logJobAudit } from '@/lib/audit'
import { generateInvoicePdf } from '@/lib/invoice-pdf'
import { sendInvoiceEmail } from '@/lib/email'
import { getCompanyContactEmail } from '@/lib/company'
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
        replyTo: (await getCompanyContactEmail(supabase)) ?? undefined,
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

  // A job with a deposit invoice raised gets a FINAL (balance) invoice next,
  // with the deposit automatically deducted -- unless a final invoice
  // already exists (never deduct the same deposit twice).
  const { data: existing } = await supabase
    .from('invoices')
    .select('invoice_type, total, tax_amount')
    .eq('job_id', jobId)
    .is('superseded_at', null)

  const depositInvoice = (existing ?? []).find((inv) => inv.invoice_type === 'deposit')
  const hasFinal = (existing ?? []).some((inv) => inv.invoice_type === 'final')
  const isFinal = Boolean(depositInvoice) && !hasFinal

  const { data: created, error } = await supabase
    .from('invoices')
    .insert({ job_id: jobId, invoice_type: isFinal ? 'final' : 'standard' })
    .select('id, tax_rate')
    .single()
  if (error || !created) errorRedirect(jobId, error?.message ?? 'Could not create invoice.')

  if (isFinal && depositInvoice) {
    // The deposit invoice's total is tax-inclusive (its own tax_rate is 0).
    // Line items are ex-tax and this invoice adds tax on the sum, so the
    // credit goes in ex-tax -- making the final's tax-inclusive total come
    // out to exactly (full amount - deposit collected).
    const depositTotal = Number(depositInvoice.total) + Number(depositInvoice.tax_amount)
    const taxRate = Number(created!.tax_rate)
    const creditExTax = Math.round((depositTotal / (1 + taxRate / 100)) * 100) / 100

    const { error: creditError } = await supabase.from('invoice_line_items').insert({
      invoice_id: created!.id,
      item_type: 'other',
      description: 'Less deposit received',
      quantity: 1,
      unit_price: -creditExTax,
      source: 'deposit_credit',
    })
    if (creditError) errorRedirect(jobId, creditError.message)

    await logJobAudit(supabase, jobId, 'Final invoice created (deposit deducted)')
  } else {
    await logJobAudit(supabase, jobId, 'Invoice created')
  }

  revalidatePath(`/jobs/${jobId}`)
}

export async function addInvoiceLineItemsBulk(
  invoiceId: string,
  jobId: string,
  items: { item_type: string; description: string; quantity: number; unit_price: number }[]
) {
  if (items.length === 0) return

  const supabase = await createClient()
  const { error } = await supabase.from('invoice_line_items').insert(
    items.map((item) => ({
      invoice_id: invoiceId,
      item_type: item.item_type,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      source: item.item_type === 'labour' || item.item_type === 'material' ? item.item_type : 'manual',
    }))
  )

  if (error) errorRedirect(jobId, error.message)

  await logJobAudit(supabase, jobId, `Added ${items.length} invoice line item${items.length === 1 ? '' : 's'}`)

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

// Only ever called for a draft invoice -- sent/paid/overdue invoices are real
// financial records and must go through createInvoiceVersion instead. Relies
// on the invoice_line_items FK cascade to clean up its line items.
export async function deleteInvoice(invoiceId: string, jobId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('invoices').delete().eq('id', invoiceId).eq('status', 'draft')
  if (error) errorRedirect(jobId, error.message)

  await logJobAudit(supabase, jobId, 'Invoice deleted')

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
