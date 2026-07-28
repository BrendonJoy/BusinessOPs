'use client'

import { useState } from 'react'
import type { CostEntry, Invoice, InvoiceLineItem } from '@trade-assist/db'
import { LINE_ITEM_TYPE_LABELS } from '@trade-assist/db'
import { formatMoney } from '@/lib/money'
import {
  addInvoiceLineItemsBulk,
  createInvoice,
  createInvoiceVersion,
  importCostEntry,
  removeInvoiceLineItem,
  updateInvoiceStatus,
  updateInvoiceTaxRate,
} from './invoice-actions'
import LineItemsEditor from './LineItemsEditor'

export type InvoiceDetail = Invoice & { invoice_line_items: InvoiceLineItem[] }

const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue'] as const

export default function InvoicePanel({
  jobId,
  invoices,
  previousInvoices,
  uninvoicedCostEntries,
  initialOpenId,
  currency,
  taxLabel,
  gstRegistered,
}: {
  jobId: string
  invoices: InvoiceDetail[]
  previousInvoices: InvoiceDetail[]
  uninvoicedCostEntries: CostEntry[]
  initialOpenId?: string
  currency: string
  taxLabel: string
  gstRegistered: boolean
}) {
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(
    initialOpenId && invoices.some((inv) => inv.id === initialOpenId) ? initialOpenId : null
  )

  const openInvoice = invoices.find((inv) => inv.id === openInvoiceId) ?? null
  const boundCreateInvoice = createInvoice.bind(null, jobId)
  const grandTotal = (inv: InvoiceDetail) => Number(inv.total) + (gstRegistered ? Number(inv.tax_amount) : 0)

  function openInvoicePanel(id: string | null) {
    setOpenInvoiceId(id)
  }

  return (
    <section className="rounded-lg border border-surface-border p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium">Invoices</h2>
        <form action={boundCreateInvoice}>
          <button
            type="submit"
            className="rounded-md border border-surface-border px-3 py-1.5 text-xs font-medium hover:border-accent"
          >
            Create invoice
          </button>
        </form>
      </div>

      {invoices.length === 0 ? (
        <p className="text-sm text-muted">No invoices yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {invoices.map((invoice) => (
            <div
              key={invoice.id}
              className="flex flex-wrap items-center gap-4 rounded-md border border-surface-border p-3 text-sm"
            >
              <span className="inline-flex items-center rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium capitalize">
                {invoice.status}
              </span>
              <span>
                Total: <span className="font-medium">{formatMoney(grandTotal(invoice), currency)}</span>
              </span>
              <a href={`/api/invoices/${invoice.id}/pdf`} className="text-accent hover:opacity-80">
                Download PDF
              </a>
              {invoice.status === 'draft' ? (
                <button
                  type="button"
                  onClick={() => openInvoicePanel(invoice.id)}
                  className="ml-auto rounded-md border border-surface-border px-3 py-1 text-xs font-medium hover:border-accent"
                >
                  Edit
                </button>
              ) : (
                <form action={createInvoiceVersion.bind(null, invoice.id, jobId)} className="ml-auto">
                  <button
                    type="submit"
                    className="rounded-md border border-surface-border px-3 py-1 text-xs font-medium hover:border-accent"
                  >
                    Edit (new version)
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}

      {previousInvoices.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-muted">
            Previous versions ({previousInvoices.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {previousInvoices.map((inv) => (
              <li key={inv.id} className="rounded-md bg-surface p-2 text-xs">
                <span className="capitalize">{inv.status}</span> — {formatMoney(grandTotal(inv), currency)}
                {inv.superseded_at && (
                  <span className="text-muted">
                    {' '}
                    — superseded {new Date(inv.superseded_at).toLocaleDateString()}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {openInvoice && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => openInvoicePanel(null)} />
          <div className="relative flex h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto bg-background p-6 shadow-xl">
            <button
              type="button"
              onClick={() => openInvoicePanel(null)}
              className="self-start text-sm text-accent hover:opacity-80"
            >
              ← Back
            </button>

            <h2 className="text-lg font-semibold">Invoice</h2>

            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="inline-flex items-center rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium capitalize">
                {openInvoice.status}
              </span>
              <span>
                Total:{' '}
                <span className="font-medium">{formatMoney(grandTotal(openInvoice), currency)}</span>
              </span>
              <a href={`/api/invoices/${openInvoice.id}/pdf`} className="text-accent hover:opacity-80">
                Download PDF
              </a>
              <form
                action={updateInvoiceStatus.bind(null, openInvoice.id, jobId)}
                className="flex items-center gap-2"
              >
                <select
                  name="status"
                  defaultValue={openInvoice.status}
                  className="rounded-md border border-surface-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
                >
                  {INVOICE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button type="submit" className="text-xs text-accent hover:opacity-80">
                  Update status
                </button>
              </form>
            </div>

            {gstRegistered && (
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Subtotal</span>
                  <span>{formatMoney(Number(openInvoice.total), currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">
                    {taxLabel} ({Number(openInvoice.tax_rate)}%)
                  </span>
                  <span>{formatMoney(Number(openInvoice.tax_amount), currency)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Total</span>
                  <span>{formatMoney(grandTotal(openInvoice), currency)}</span>
                </div>
              </div>
            )}

            {gstRegistered && openInvoice.status === 'draft' && (
              <form
                action={updateInvoiceTaxRate.bind(null, openInvoice.id, jobId)}
                className="flex items-end gap-3"
              >
                <div className="flex flex-col gap-1">
                  <label htmlFor="invoice_tax_rate" className="text-xs font-medium">
                    {taxLabel} rate %
                  </label>
                  <input
                    id="invoice_tax_rate"
                    name="tax_rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    defaultValue={openInvoice.tax_rate}
                    className="w-24 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-md border border-surface-border px-4 py-2 text-sm font-medium hover:border-accent"
                >
                  Update
                </button>
              </form>
            )}

            {openInvoice.invoice_line_items.length > 0 && (
              <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted">
                  <tr>
                    <th className="py-1 font-medium">Type</th>
                    <th className="py-1 font-medium">Description</th>
                    <th className="py-1 font-medium">Qty</th>
                    <th className="py-1 font-medium">Unit price</th>
                    <th className="py-1 font-medium">Total</th>
                    <th className="py-1" />
                  </tr>
                </thead>
                <tbody>
                  {openInvoice.invoice_line_items.map((item) => (
                    <tr key={item.id} className="border-t border-surface-border">
                      <td className="py-1 text-xs text-muted">{LINE_ITEM_TYPE_LABELS[item.item_type]}</td>
                      <td className="py-1">{item.description}</td>
                      <td className="py-1">{item.quantity}</td>
                      <td className="py-1">{formatMoney(Number(item.unit_price), currency)}</td>
                      <td className="py-1">{formatMoney(Number(item.line_total), currency)}</td>
                      <td className="py-1 text-right">
                        {openInvoice.status === 'draft' && (
                          <form action={removeInvoiceLineItem.bind(null, item.id, jobId)}>
                            <button type="submit" className="text-xs text-muted hover:text-accent">
                              Remove
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}

            {openInvoice.status === 'draft' && (
              <div className="flex flex-col gap-3">
                {uninvoicedCostEntries.length > 0 && (
                  <div className="rounded-md bg-surface p-2">
                    <p className="mb-2 text-xs font-medium text-muted">Add from job costs</p>
                    <ul className="flex flex-col gap-1">
                      {uninvoicedCostEntries.map((entry) => (
                        <li key={entry.id} className="flex items-center justify-between gap-3 text-sm">
                          <span>
                            {entry.description} — {formatMoney(Number(entry.total_cost), currency)}
                          </span>
                          <form action={importCostEntry.bind(null, openInvoice.id, jobId, entry.id)}>
                            <button type="submit" className="text-xs text-accent hover:opacity-80">
                              Add to invoice
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <LineItemsEditor
                  currency={currency}
                  onSave={(items) => addInvoiceLineItemsBulk(openInvoice.id, jobId, items)}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
