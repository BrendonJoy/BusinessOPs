'use client'

import { useState } from 'react'
import { formatMoney } from '@/lib/money'
import { LINE_ITEM_TYPES, LINE_ITEM_TYPE_LABELS, type LineItemType } from '@trade-assist/db'
import { Button, Field, Input, Select } from '@/components/ui'

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
          <div
            key={row.key}
            className="flex flex-col gap-2 rounded-md border border-surface-border p-3 sm:flex-row sm:flex-wrap sm:items-end sm:border-0 sm:p-0"
          >
            <Field label="Type" htmlFor={`type-${row.key}`}>
              <Select
                id={`type-${row.key}`}
                value={row.item_type}
                onChange={(e) => updateRow(row.key, { item_type: e.target.value as LineItemType })}
              >
                {LINE_ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {LINE_ITEM_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Description"
              htmlFor={`desc-${row.key}`}
              className="min-w-[160px] flex-1"
            >
              <Input
                id={`desc-${row.key}`}
                type="text"
                value={row.description}
                onChange={(e) => updateRow(row.key, { description: e.target.value })}
              />
            </Field>

            {row.item_type === 'callout' ? (
              <Field label="Amount" htmlFor={`amount-${row.key}`}>
                <Input
                  id={`amount-${row.key}`}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={row.unit_price}
                  onChange={(e) => updateRow(row.key, { unit_price: Number(e.target.value) })}
                  className="sm:w-28"
                />
              </Field>
            ) : (
              <>
                <Field
                  label={row.item_type === 'labour' ? 'Hours' : 'Qty'}
                  htmlFor={`qty-${row.key}`}
                >
                  <Input
                    id={`qty-${row.key}`}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={row.quantity}
                    onChange={(e) => updateRow(row.key, { quantity: Number(e.target.value) })}
                    className="sm:w-20"
                  />
                </Field>
                <Field
                  label={row.item_type === 'labour' ? 'Rate' : 'Unit price'}
                  htmlFor={`price-${row.key}`}
                >
                  <Input
                    id={`price-${row.key}`}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={row.unit_price}
                    onChange={(e) => updateRow(row.key, { unit_price: Number(e.target.value) })}
                    className="sm:w-24"
                  />
                </Field>
              </>
            )}

            <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-start sm:gap-1">
              <span className="text-sm font-medium sm:text-xs">Total</span>
              <p className="text-sm sm:px-1 sm:py-2">
                {formatMoney((row.item_type === 'callout' ? 1 : row.quantity) * row.unit_price, currency)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => removeRow(row.key)}
              className="self-start text-xs text-muted hover:text-accent"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={addRow} size="sm">
          Add row
        </Button>
        <Button type="button" onClick={handleSave} disabled={isSaving} variant="primary" size="sm">
          {isSaving ? 'Saving…' : 'Save items'}
        </Button>
      </div>
    </div>
  )
}
