'use client'

import { useState } from 'react'
import type { PayType } from '@trade-assist/db'
import { Field, Input, Select } from '@/components/ui'

/**
 * Three states, not two: not set up yet, hourly, or salaried.
 *
 * "Salaried" and "no rate entered" used to look identical in the data, so a
 * manager who was deliberately left off hourly pay was indistinguishable from
 * a casual nobody had finished setting up — and both silently produced no
 * labour cost on clock-out. Making it an explicit choice means the absence of a
 * setting still means "outstanding".
 *
 * A client component purely so the rate field disappears when it cannot apply.
 * Showing a rate box that the server will ignore invites someone to type a
 * number into it and believe it took.
 */
export default function PayFields({
  idPrefix,
  payType,
  payRate,
}: {
  idPrefix: string
  payType: PayType | null
  payRate: number | null
}) {
  const [type, setType] = useState<PayType | ''>(payType ?? '')

  return (
    <>
      <Field label="Pay" htmlFor={`pay_type-${idPrefix}`}>
        <Select
          id={`pay_type-${idPrefix}`}
          name="pay_type"
          value={type}
          onChange={(e) => setType(e.target.value as PayType | '')}
          fullWidth={false}
          className="sm:w-44"
        >
          <option value="">Not set</option>
          <option value="hourly">Hourly</option>
          <option value="salaried">Salaried</option>
        </Select>
      </Field>

      {type === 'hourly' && (
        <Field label="Hourly rate" htmlFor={`pay_rate-${idPrefix}`}>
          <Input
            id={`pay_rate-${idPrefix}`}
            name="pay_rate"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            defaultValue={payRate ?? ''}
            className="sm:w-32"
          />
        </Field>
      )}

      {type === 'salaried' && (
        <p className="self-end pb-2 text-xs text-muted">
          Rostered as normal, but no hourly cost is recorded on clock-out.
        </p>
      )}
    </>
  )
}
