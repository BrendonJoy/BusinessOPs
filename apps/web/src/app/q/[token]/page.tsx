import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/money'
import { LINE_ITEM_TYPES, LINE_ITEM_TYPE_LABELS } from '@trade-assist/db'
import type { Quote, QuoteLineItem } from '@trade-assist/db'
import { Button, DataTable, Notice, type Column } from '@/components/ui'
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

/**
 * This page is public by design — the customer must be able to open it without
 * an account — but "reachable by anyone holding the link" is not "publishable".
 * It shows a named individual's address and what they were quoted, so it must
 * never be indexed. `nocache`/`noarchive` also keep it out of search-engine
 * caches, which outlive the quote itself.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true, noarchive: true },
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
          <Notice tone="error" className="mt-4">
            {actionError}
          </Notice>
        )}

        {LINE_ITEM_TYPES.map((type) => {
          const items = line_items.filter((item) => item.item_type === type)
          if (items.length === 0) return null

          const isCallout = type === 'callout'
          const columns: Column<(typeof items)[number]>[] = [
            {
              key: 'description',
              header: 'Description',
              mobile: 'title',
              className: 'w-1/2',
              cell: (item) => item.description,
            },
            {
              key: 'total',
              header: 'Total',
              mobile: 'meta',
              className: 'w-1/6',
              cell: (item) => formatMoney(Number(item.line_total), company.currency),
            },
            {
              key: 'quantity',
              header: isCallout ? '' : type === 'labour' ? 'Hours' : 'Qty',
              mobileLabel: type === 'labour' ? 'Hours' : 'Qty',
              className: 'w-1/6',
              mobile: isCallout ? 'hidden' : 'row',
              cell: (item) => (isCallout ? '' : item.quantity),
            },
            {
              key: 'unit_price',
              header: isCallout ? '' : type === 'labour' ? 'Rate' : 'Unit price',
              mobileLabel: type === 'labour' ? 'Rate' : 'Unit price',
              className: 'w-1/6',
              mobile: isCallout ? 'hidden' : 'row',
              cell: (item) =>
                isCallout ? '' : formatMoney(Number(item.unit_price), company.currency),
            },
          ]

          return (
            <div key={type} className="mt-6">
              <h3 className="mb-2 text-xs font-semibold text-muted">{LINE_ITEM_TYPE_LABELS[type]}</h3>
              <DataTable columns={columns} rows={items} getRowKey={(item) => item.id} />
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
                // Full-width on a phone: this is the one action the customer
                // came here to take, and it's often taken one-handed.
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <form action={respondToQuote.bind(null, token, 'accepted')}>
                    <Button type="submit" variant="primary" className="w-full sm:w-auto">
                      Accept quote
                    </Button>
                  </form>
                  <form action={respondToQuote.bind(null, token, 'declined')}>
                    <Button type="submit" className="w-full sm:w-auto">
                      Decline
                    </Button>
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
