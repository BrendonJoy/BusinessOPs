'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatMoney } from '@/lib/money'

export type DrilldownItem = {
  id: string
  jobId: string
  jobNumber: string | null
  customerName: string | null
  amount: number
  linkParam: 'openQuote' | 'openInvoice'
}

export default function StatDrilldown({
  label,
  items,
  currency,
}: {
  label: string
  items: DrilldownItem[]
  currency: string
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-lg border border-surface-border p-4 text-left hover:border-accent"
      >
        <p className="text-2xl font-semibold">{items.length}</p>
        <p className="text-xs text-muted">{label}</p>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsOpen(false)} />
          <div className="relative flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto bg-background p-6 shadow-xl">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="self-start text-sm text-accent hover:opacity-80"
            >
              ← Back
            </button>
            <h2 className="text-lg font-semibold">{label}</h2>
            {items.length === 0 ? (
              <p className="text-sm text-muted">Nothing here.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {items.map((item) => (
                  <li key={item.id} className="rounded-md border border-surface-border p-3">
                    <Link
                      href={`/jobs/${item.jobId}?${item.linkParam}=${item.id}`}
                      className="flex items-center justify-between gap-3 hover:text-accent"
                    >
                      <span>
                        <span className="font-medium">{item.jobNumber ?? 'Job'}</span>
                        {' — '}
                        <span>{item.customerName ?? 'Customer'}</span>
                      </span>
                      <span className="font-medium">{formatMoney(item.amount, currency)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  )
}
