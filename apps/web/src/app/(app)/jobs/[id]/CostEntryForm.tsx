'use client'

import { useState } from 'react'

export default function CostEntryForm({
  action,
  payRate,
}: {
  action: (formData: FormData) => void
  payRate: number | null
}) {
  const [unitCost, setUnitCost] = useState('0')
  const [touched, setTouched] = useState(false)

  function handleTypeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (e.target.value === 'labour' && payRate != null && !touched) {
      setUnitCost(String(payRate))
    }
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="type" className="text-xs font-medium">
          Type
        </label>
        <select
          id="type"
          name="type"
          onChange={handleTypeChange}
          className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
        >
          <option value="material">Material</option>
          <option value="labour">Labour</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-xs font-medium">
          Description
        </label>
        <input
          id="description"
          name="description"
          type="text"
          required
          className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="quantity" className="text-xs font-medium">
          Qty / hours
        </label>
        <input
          id="quantity"
          name="quantity"
          type="number"
          step="0.01"
          defaultValue="1"
          className="w-24 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="unit_cost" className="text-xs font-medium">
          Unit cost / rate
        </label>
        <input
          id="unit_cost"
          name="unit_cost"
          type="number"
          step="0.01"
          value={unitCost}
          onChange={(e) => {
            setUnitCost(e.target.value)
            setTouched(true)
          }}
          className="w-28 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
      </div>
      <button
        type="submit"
        className="rounded-md border border-surface-border px-4 py-2 text-sm font-medium hover:border-accent"
      >
        Add
      </button>
    </form>
  )
}
