'use client'

import { useState } from 'react'
import { formatMoney } from '@/lib/money'
import { LINE_ITEM_TYPES, LINE_ITEM_TYPE_LABELS, type LineItemType } from '@trade-assist/db'

export type EditableLineItem = {
  key: string
  item_type: LineItemType
  description: string
  quantity: number
  unit_price: number
}

function emptyRow(): EditableLineItem {
  return { key: crypto.randomUUID(), item_type: 'material', description: '', quantity: 1, unit_price: 0 }
}

export default function LineItemsEditor({
  currency,
  onSave,
}: {
  currency: string
  onSave: (
    items: { item_type: LineItemType; description: string; quantity: number; unit_price: number }[]
  ) => Promise<void>
}) {
  const [rows, setRows] = useState<EditableLineItem[]>([emptyRow()])
  const [isSaving, setIsSaving] = useState(false)

  function updateRow(key: string, patch: Partial<EditableLineItem>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key))
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()])
  }

  async function handleSave() {
    const validRows = rows.filter((r) => r.description.trim())
    if (validRows.length === 0) return

    setIsSaving(true)
    await onSave(
      validRows.map((r) => ({
        item_type: r.item_type,
        description: r.description.trim(),
        quantity: r.item_type === 'callout' ? 1 : r.quantity,
        unit_price: r.unit_price,
      }))
    )
    setRows([emptyRow()])
    setIsSaving(false)
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-surface-border p-3">
      <p className="text-xs font-medium text-muted">Add line items</p>

      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Type</label>
              <select
                value={row.item_type}
                onChange={(e) => updateRow(row.key, { item_type: e.target.value as LineItemType })}
                className="rounded-md border border-surface-border bg-background px-2 py-2 text-sm focus:border-accent focus:outline-none"
              >
                {LINE_ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {LINE_ITEM_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex min-w-[160px] flex-1 flex-col gap-1">
              <label className="text-xs font-medium">Description</label>
              <input
                type="text"
                value={row.description}
                onChange={(e) => updateRow(row.key, { description: e.target.value })}
                className="w-full rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>

            {row.item_type === 'callout' ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={row.unit_price}
                  onChange={(e) => updateRow(row.key, { unit_price: Number(e.target.value) })}
                  className="w-28 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium">{row.item_type === 'labour' ? 'Hours' : 'Qty'}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={row.quantity}
                    onChange={(e) => updateRow(row.key, { quantity: Number(e.target.value) })}
                    className="w-20 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium">
                    {row.item_type === 'labour' ? 'Rate' : 'Unit price'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={row.unit_price}
                    onChange={(e) => updateRow(row.key, { unit_price: Number(e.target.value) })}
                    className="w-24 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  />
                </div>
              </>
            )}

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium">Total</span>
              <p className="px-1 py-2 text-sm">
                {formatMoney((row.item_type === 'callout' ? 1 : row.quantity) * row.unit_price, currency)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => removeRow(row.key)}
              className="text-xs text-muted hover:text-accent"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={addRow}
          className="rounded-md border border-surface-border px-3 py-1.5 text-xs font-medium hover:border-accent"
        >
          Add row
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          {isSaving ? 'Saving…' : 'Save items'}
        </button>
      </div>
    </div>
  )
}
