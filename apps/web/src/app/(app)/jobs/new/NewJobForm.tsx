'use client'

import { useState } from 'react'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import { Button, Field, Input, Textarea, cardClasses, checkboxClasses } from '@/components/ui'

type FormValues = {
  customerName: string
  customerEmail: string
  customerPhone: string
  customerAddress: string
  addressLine: string
  startDate: string
  startTime: string
  finishDate: string
  finishTime: string
  notes: string
}

const EMPTY_FORM: FormValues = {
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  customerAddress: '',
  addressLine: '',
  startDate: '',
  startTime: '',
  finishDate: '',
  finishTime: '',
  notes: '',
}

type CustomerOption = {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
}

type TeamOption = {
  id: string
  full_name: string | null
  email: string
}

export default function NewJobForm({
  createJob,
  customers,
  teamOptions,
}: {
  createJob: (formData: FormData) => void
  customers: CustomerOption[]
  teamOptions: TeamOption[]
}) {
  const [form, setForm] = useState<FormValues>(EMPTY_FORM)
  const [sameAsCustomerAddress, setSameAsCustomerAddress] = useState(false)
  const [jobGeo, setJobGeo] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null })
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)

  function updateField<K extends keyof FormValues>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleCustomerNameChange(value: string) {
    updateField('customerName', value)

    const match = customers.find((c) => c.name.trim().toLowerCase() === value.trim().toLowerCase())

    if (match) {
      setSelectedCustomerId(match.id)
      setForm((prev) => ({
        ...prev,
        customerName: value,
        customerEmail: match.email ?? '',
        customerPhone: match.phone ?? '',
        customerAddress: match.address ?? '',
      }))
    } else {
      setSelectedCustomerId(null)
    }
  }

  function clearSelectedCustomer() {
    setSelectedCustomerId(null)
  }

  async function toggleSameAsCustomerAddress(checked: boolean) {
    setSameAsCustomerAddress(checked)
    if (!checked || !form.customerAddress.trim()) return

    setIsGeocoding(true)
    const res = await fetch(`/api/geocode?address=${encodeURIComponent(form.customerAddress)}`)
    if (res.ok) {
      const data = await res.json()
      setJobGeo({ lat: data.lat, lng: data.lng })
    } else {
      setJobGeo({ lat: null, lng: null })
    }
    setIsGeocoding(false)
  }

  return (
    <div className="flex flex-col gap-6">
      <form action={createJob} className="flex flex-col gap-4">
        <fieldset className={cardClasses('flex flex-col gap-4')}>
          <legend className="px-1 text-sm font-medium">Customer</legend>
          <input type="hidden" name="customer_id" value={selectedCustomerId ?? ''} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="customer_name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="customer_name"
              name="customer_name"
              type="text"
              required
              list="customer-names"
              value={form.customerName}
              onChange={(e) => handleCustomerNameChange(e.target.value)}
            />
            <datalist id="customer-names">
              {customers.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
            {selectedCustomerId ? (
              <p className="text-xs text-muted">
                Existing customer — details below are saved to their record.{' '}
                <button type="button" onClick={clearSelectedCustomer} className="text-accent hover:opacity-80">
                  Not them? Create as new
                </button>
              </p>
            ) : (
              <p className="text-xs text-muted">Matches an existing customer by name, or creates a new one.</p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="customer_email">
              <Input
                id="customer_email"
                name="customer_email"
                type="email"
                value={form.customerEmail}
                onChange={(e) => updateField('customerEmail', e.target.value)}
              />
            </Field>
            <Field label="Phone" htmlFor="customer_phone">
              <Input
                id="customer_phone"
                name="customer_phone"
                type="tel"
                value={form.customerPhone}
                onChange={(e) => updateField('customerPhone', e.target.value)}
              />
            </Field>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="customer_address" className="text-sm font-medium">
              Customer address
            </label>
            <AddressAutocomplete
              id="customer_address"
              name="customer_address"
              defaultValue={form.customerAddress}
              onValueChange={(v) => updateField('customerAddress', v.address)}
            />
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="address_line" className="text-sm font-medium">
            Job address
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm text-muted sm:min-h-0">
            <input
              type="checkbox"
              checked={sameAsCustomerAddress}
              onChange={(e) => toggleSameAsCustomerAddress(e.target.checked)}
              disabled={!form.customerAddress.trim()}
              className={checkboxClasses()}
            />
            Same as customer address
          </label>
          {sameAsCustomerAddress ? (
            <>
              <Input
                type="text"
                readOnly
                aria-label="Job address"
                value={isGeocoding ? 'Locating…' : form.customerAddress}
                className="bg-surface text-muted"
              />
              <input type="hidden" name="address_line" value={form.customerAddress} />
              <input type="hidden" name="geo_lat" value={jobGeo.lat ?? ''} />
              <input type="hidden" name="geo_lng" value={jobGeo.lng ?? ''} />
            </>
          ) : (
            <AddressAutocomplete
              key={form.addressLine}
              id="address_line"
              name="address_line"
              geoLatName="geo_lat"
              geoLngName="geo_lng"
              defaultValue={form.addressLine}
            />
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Start date" htmlFor="start_date">
            <div className="flex gap-2">
              <Input
                id="start_date"
                name="start_date"
                type="date"
                value={form.startDate}
                onChange={(e) => updateField('startDate', e.target.value)}
                className="min-w-0 flex-1"
              />
              <Input
                id="start_time"
                name="start_time"
                type="time"
                aria-label="Start time"
                value={form.startTime}
                onChange={(e) => updateField('startTime', e.target.value)}
                fullWidth={false}
                className="w-32 shrink-0"
              />
            </div>
          </Field>
          <Field label="Finish date" htmlFor="finish_date">
            <div className="flex gap-2">
              <Input
                id="finish_date"
                name="finish_date"
                type="date"
                value={form.finishDate}
                onChange={(e) => updateField('finishDate', e.target.value)}
                className="min-w-0 flex-1"
              />
              <Input
                id="finish_time"
                name="finish_time"
                type="time"
                aria-label="Finish time"
                value={form.finishTime}
                onChange={(e) => updateField('finishTime', e.target.value)}
                fullWidth={false}
                className="w-32 shrink-0"
              />
            </div>
          </Field>
        </div>

        <Field label="Notes" htmlFor="notes">
          <Textarea
            id="notes"
            name="notes"
            rows={3}
            value={form.notes}
            onChange={(e) => updateField('notes', e.target.value)}
          />
        </Field>

        {teamOptions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Assigned to</span>
            <div className="flex flex-col gap-1 rounded-md border border-surface-border px-3 py-2">
              {teamOptions.map((member) => (
                <label
                  key={member.id}
                  className="flex min-h-11 items-center gap-2 text-sm sm:min-h-0 sm:py-1"
                >
                  <input
                    type="checkbox"
                    name="assigned_user_ids"
                    value={member.id}
                    className={checkboxClasses()}
                  />
                  {member.full_name ?? member.email}
                </label>
              ))}
            </div>
          </div>
        )}

        <Button type="submit" variant="primary" className="mt-2 w-full sm:w-auto sm:self-start">
          Create job
        </Button>
      </form>
    </div>
  )
}
