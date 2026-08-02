'use client'

import { useState } from 'react'
import { Button, Field, Input, Select } from '@/components/ui'

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
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <Field label="Type" htmlFor="type">
        <Select id="type" name="type" onChange={handleTypeChange}>
          <option value="material">Material</option>
          <option value="labour">Labour</option>
        </Select>
      </Field>
      <Field label="Description" htmlFor="description" required className="min-w-[200px] flex-1">
        <Input id="description" name="description" type="text" required />
      </Field>
      <Field label="Qty / hours" htmlFor="quantity">
        <Input
          id="quantity"
          name="quantity"
          type="number"
          inputMode="decimal"
          step="0.01"
          defaultValue="1"
          className="sm:w-24"
        />
      </Field>
      <Field label="Unit cost / rate" htmlFor="unit_cost">
        <Input
          id="unit_cost"
          name="unit_cost"
          type="number"
          inputMode="decimal"
          step="0.01"
          value={unitCost}
          onChange={(e) => {
            setUnitCost(e.target.value)
            setTouched(true)
          }}
          className="sm:w-28"
        />
      </Field>
      <Button type="submit" className="w-full sm:w-auto">
        Add
      </Button>
    </form>
  )
}
