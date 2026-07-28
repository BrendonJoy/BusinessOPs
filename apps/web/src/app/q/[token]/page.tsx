import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/money'
import { LINE_ITEM_TYPES, LINE_ITEM_TYPE_LABELS } from '@trade-assist/db'
import type { Quote, QuoteLineItem } from '@trade-assist/db'
import { respondToQuote } from './actions'

type PublicQuote = Omit<Quote, 'share_token'>

type QuotePublicData = {
  quote: PublicQuote
  line_items: QuoteLineItem[]
  job: { job_number: string | null; address_line: string | null }
  customer: { name: string | null }
  company: {
    name: string | null
    logo_url: string | null
    gst_number: string | null
    address: string | null
    currency: string
    tax_label: string
    gst_registered: boolean
  }
}

export default async function PublicQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { token } = await params
  const { error: actionError } = await searchParams
  const supabase = await createClient()

  const { data } = await supabase.rpc('get_quote_by_token', { p_token: token })
  const result = data as unknown as QuotePublicData | null

  if (!result) notFound()

  const { quote, line_items, job, customer, company } = result
  const companyName = company.name?.trim() || 'BusinessOps'
  const grandTotal = Number(quote.total) + (company.gst_registered ? Number(quote.tax_amount) : 0)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-16">
      <div className="flex items-center gap-2">
        {company.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={company.logo_url} alt={companyName} className="h-8 w-8 rounded-md object-contain" />
        ) : (
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
        )}
        <span className="text-lg font-semibold tracking-tight">{companyName}</span>
      </div>

      <div className="rounded-lg border border-surface-border p-6">
        <p className="text-sm text-muted">Quote for {job.job_number ?? 'your job'}</p>
        <h1 className="text-xl font-semibold">{customer.name ?? 'Customer'}</h1>
        {job.address_line && <p className="text-sm text-muted">{job.address_line}</p>}
        {company.address && <p className="mt-2 text-xs text-muted">{company.address}</p>}
        {company.gst_registered && company.gst_number && (
          <p className="text-xs text-muted">GST/Tax number: {company.gst_number}</p>
        )}

        {actionError && (
          <p className="mt-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{actionError}</p>
        )}

        {LINE_ITEM_TYPES.map((type) => {
          const items = line_items.filter((item) => item.item_type === type)
          if (items.length === 0) return null

          return (
            <div key={type} className="mt-6">
              <h3 className="mb-2 text-xs font-semibold text-muted">{LINE_ITEM_TYPE_LABELS[type]}</h3>
              <div className="overflow-x-auto">
              <table className="w-full table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-1/2" />
                  <col className="w-1/6" />
                  <col className="w-1/6" />
                  <col className="w-1/6" />
                </colgroup>
                <thead className="text-muted">
                  <tr>
                    <th className="py-1 font-medium">Description</th>
                    <th className="py-1 font-medium">{type === 'callout' ? '' : type === 'labour' ? 'Hours' : 'Qty'}</th>
                    <th className="py-1 font-medium">{type === 'callout' ? '' : type === 'labour' ? 'Rate' : 'Unit price'}</th>
                    <th className="py-1 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t border-surface-border">
                      <td className="py-2">{item.description}</td>
                      <td className="py-2">{type === 'callout' ? '' : item.quantity}</td>
                      <td className="py-2">
                        {type === 'callout' ? '' : formatMoney(Number(item.unit_price), company.currency)}
                      </td>
                      <td className="py-2">{formatMoney(Number(item.line_total), company.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )
        })}

        <div className="mt-4 flex flex-col items-end gap-1 text-sm">
          {company.gst_registered && (
            <>
              <div className="flex gap-6">
                <span className="text-muted">Subtotal</span>
                <span>{formatMoney(Number(quote.total), company.currency)}</span>
              </div>
              <div className="flex gap-6">
                <span className="text-muted">
                  {company.tax_label} ({Number(quote.tax_rate)}%)
                </span>
                <span>{formatMoney(Number(quote.tax_amount), company.currency)}</span>
              </div>
            </>
          )}
          <div className="flex gap-6 text-lg font-semibold">
            <span>Total</span>
            <span>{formatMoney(grandTotal, company.currency)}</span>
          </div>
        </div>

        <div className="mt-8 border-t border-surface-border pt-6">
          {quote.superseded_at ? (
            <p className="text-sm text-muted">
              This quote has been updated by your tradesperson since this link was sent. Please ask
              them for the latest version.
            </p>
          ) : (
            <>
              {quote.status === 'sent' && (
                <div className="flex items-center gap-3">
                  <form action={respondToQuote.bind(null, token, 'accepted')}>
                    <button
                      type="submit"
                      className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
                    >
                      Accept quote
                    </button>
                  </form>
                  <form action={respondToQuote.bind(null, token, 'declined')}>
                    <button
                      type="submit"
                      className="rounded-md border border-surface-border px-4 py-2 text-sm font-medium hover:border-accent"
                    >
                      Decline
                    </button>
                  </form>
                </div>
              )}

              {quote.status === 'accepted' && (
                <p className="text-sm font-medium text-accent">You accepted this quote. Thank you!</p>
              )}
              {quote.status === 'declined' && (
                <p className="text-sm text-muted">You declined this quote.</p>
              )}
              {quote.status === 'draft' && (
                <p className="text-sm text-muted">This quote hasn&apos;t been sent to you yet.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
