'use client'

import { useState } from 'react'
import type { AccessLevel, Quote, QuoteLineItem } from '@trade-assist/db'
import { LINE_ITEM_TYPE_LABELS } from '@trade-assist/db'
import { formatMoney } from '@/lib/money'
import {
  addQuoteLineItemsBulk,
  createQuote,
  createQuoteVersion,
  deleteQuoteLineItem,
  markQuoteSent,
  updateQuoteDeposit,
  updateQuoteTaxRate,
} from './quote-actions'
import LineItemsEditor from './LineItemsEditor'

export type QuoteDetail = Quote & { quote_line_items: QuoteLineItem[] }

export default function QuotePanel({
  jobId,
  quote,
  previousQuotes,
  baseUrl,
  initialOpenId,
  currency,
  taxLabel,
  gstRegistered,
  accessLevel,
}: {
  jobId: string
  quote: QuoteDetail | null
  previousQuotes: QuoteDetail[]
  baseUrl: string
  initialOpenId?: string
  currency: string
  taxLabel: string
  gstRegistered: boolean
  accessLevel: AccessLevel
}) {
  const [isOpen, setIsOpen] = useState(Boolean(quote && initialOpenId === quote.id))
  const [requireDeposit, setRequireDeposit] = useState(Number(quote?.deposit_percent ?? 0) > 0)

  if (accessLevel === 'hidden') return null

  const canEdit = accessLevel === 'full'
  const quoteFrozen = quote?.status === 'accepted' || quote?.status === 'declined'
  const boundCreateQuote = createQuote.bind(null, jobId)
  const grandTotal = (q: QuoteDetail) => Number(q.total) + (gstRegistered ? Number(q.tax_amount) : 0)

  return (
    <section className="rounded-lg border border-surface-border p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium">Quote</h2>
        {!canEdit ? null : !quote ? (
          <form action={boundCreateQuote}>
            <button
              type="submit"
              className="rounded-md border border-surface-border px-3 py-1.5 text-xs font-medium hover:border-accent"
            >
              Create quote
            </button>
          </form>
        ) : quote.status === 'draft' ? (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="rounded-md border border-surface-border px-3 py-1.5 text-xs font-medium hover:border-accent"
          >
            Edit
          </button>
        ) : (
          <form action={createQuoteVersion.bind(null, quote.id, jobId)}>
            <button
              type="submit"
              className="rounded-md border border-surface-border px-3 py-1.5 text-xs font-medium hover:border-accent"
            >
              Edit (new version)
            </button>
          </form>
        )}
      </div>

      {quote ? (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="inline-flex items-center rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium capitalize">
            {quote.status}
          </span>
          <span>
            Total: <span className="font-medium">{formatMoney(grandTotal(quote), currency)}</span>
          </span>
          {quote.share_token && (
            <a
              href={`${baseUrl}/q/${quote.share_token}`}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:opacity-80"
            >
              Share link
            </a>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">No quote yet.</p>
      )}

      {previousQuotes.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-muted">
            Previous versions ({previousQuotes.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {previousQuotes.map((q) => (
              <li key={q.id} className="rounded-md bg-surface p-2 text-xs">
                <span className="capitalize">{q.status}</span> — {formatMoney(grandTotal(q), currency)}
                {q.superseded_at && (
                  <span className="text-muted">
                    {' '}
                    — superseded {new Date(q.superseded_at).toLocaleDateString()}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {isOpen && quote && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsOpen(false)} />
          <div className="relative flex h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto bg-background p-6 shadow-xl">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="self-start text-sm text-accent hover:opacity-80"
            >
              ← Back
            </button>

            <h2 className="text-lg font-semibold">Quote</h2>

            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="inline-flex items-center rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium capitalize">
                {quote.status}
              </span>
              <span>
                Total: <span className="font-medium">{formatMoney(grandTotal(quote), currency)}</span>
              </span>
              {canEdit && quote.status === 'draft' && (
                <form action={markQuoteSent.bind(null, quote.id, jobId)}>
                  <button type="submit" className="text-accent hover:opacity-80">
                    Send
                  </button>
                </form>
              )}
            </div>

            {gstRegistered && (
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Subtotal</span>
                  <span>{formatMoney(Number(quote.total), currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">
                    {taxLabel} ({Number(quote.tax_rate)}%)
                  </span>
                  <span>{formatMoney(Number(quote.tax_amount), currency)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Total</span>
                  <span>{formatMoney(grandTotal(quote), currency)}</span>
                </div>
              </div>
            )}

            {canEdit && !quoteFrozen && (
              <div className="flex items-end gap-6">
                <form
                  action={updateQuoteDeposit.bind(null, quote.id, jobId)}
                  className="flex flex-col gap-2"
                >
                  <label className="flex items-center gap-2 text-xs font-medium">
                    <input
                      type="checkbox"
                      checked={requireDeposit}
                      onChange={(e) => setRequireDeposit(e.target.checked)}
                    />
                    Require deposit
                  </label>
                  <div className="flex items-end gap-3">
                    <div className="flex flex-col gap-1">
                      <label htmlFor="deposit_percent" className="text-xs font-medium">
                        Deposit %
                      </label>
                      <input
                        id="deposit_percent"
                        name="deposit_percent"
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        disabled={!requireDeposit}
                        defaultValue={quote.deposit_percent || 20}
                        className="w-24 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none disabled:opacity-50"
                      />
                    </div>
                    <button
                      type="submit"
                      className="rounded-md border border-surface-border px-4 py-2 text-sm font-medium hover:border-accent"
                    >
                      Update
                    </button>
                  </div>
                </form>

                {gstRegistered && (
                  <form
                    action={updateQuoteTaxRate.bind(null, quote.id, jobId)}
                    className="flex items-end gap-3"
                  >
                    <div className="flex flex-col gap-1">
                      <label htmlFor="tax_rate" className="text-xs font-medium">
                        {taxLabel} rate %
                      </label>
                      <input
                        id="tax_rate"
                        name="tax_rate"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        defaultValue={quote.tax_rate}
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
              </div>
            )}

            {quote.share_token && (
              <p className="text-sm text-muted">
                Share link:{' '}
                <a
                  href={`${baseUrl}/q/${quote.share_token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent"
                >
                  {`${baseUrl}/q/${quote.share_token}`}
                </a>
              </p>
            )}

            {quote.quote_line_items.length > 0 && (
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
                  {quote.quote_line_items.map((item) => (
                    <tr key={item.id} className="border-t border-surface-border">
                      <td className="py-1 text-xs text-muted">{LINE_ITEM_TYPE_LABELS[item.item_type]}</td>
                      <td className="py-1">{item.description}</td>
                      <td className="py-1">{item.quantity}</td>
                      <td className="py-1">{formatMoney(Number(item.unit_price), currency)}</td>
                      <td className="py-1">{formatMoney(Number(item.line_total), currency)}</td>
                      <td className="py-1 text-right">
                        {canEdit && !quoteFrozen && (
                          <form action={deleteQuoteLineItem.bind(null, item.id, jobId)}>
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

            {canEdit && !quoteFrozen && (
              <LineItemsEditor
                currency={currency}
                onSave={(items) => addQuoteLineItemsBulk(quote.id, jobId, items)}
              />
            )}
          </div>
        </div>
      )}
    </section>
  )
}
