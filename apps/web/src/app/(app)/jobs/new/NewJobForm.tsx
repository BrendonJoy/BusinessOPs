'use client'

import { useState } from 'react'
import AddressAutocomplete from '@/components/AddressAutocomplete'

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
        <fieldset className="flex flex-col gap-4 rounded-lg border border-surface-border p-4">
          <legend className="px-1 text-sm font-medium">Customer</legend>
          <input type="hidden" name="customer_id" value={selectedCustomerId ?? ''} />
          <div className="flex flex-col gap-1">
            <label htmlFor="customer_name" className="text-sm font-medium">
              Name
            </label>
            <input
              id="customer_name"
              name="customer_name"
              type="text"
              required
              list="customer-names"
              value={form.customerName}
              onChange={(e) => handleCustomerNameChange(e.target.value)}
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
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
            <div className="flex flex-col gap-1">
              <label htmlFor="customer_email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="customer_email"
                name="customer_email"
                type="email"
                value={form.customerEmail}
                onChange={(e) => updateField('customerEmail', e.target.value)}
                className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="customer_phone" className="text-sm font-medium">
                Phone
              </label>
              <input
                id="customer_phone"
                name="customer_phone"
                type="tel"
                value={form.customerPhone}
                onChange={(e) => updateField('customerPhone', e.target.value)}
                className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
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

        <div className="flex flex-col gap-1">
          <label htmlFor="address_line" className="text-sm font-medium">
            Job address
          </label>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={sameAsCustomerAddress}
              onChange={(e) => toggleSameAsCustomerAddress(e.target.checked)}
              disabled={!form.customerAddress.trim()}
            />
            Same as customer address
          </label>
          {sameAsCustomerAddress ? (
            <>
              <input
                type="text"
                readOnly
                value={isGeocoding ? 'Locating…' : form.customerAddress}
                className="w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-muted"
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
          <div className="flex flex-col gap-1">
            <label htmlFor="start_date" className="text-sm font-medium">
              Start date
            </label>
            <div className="flex gap-2">
              <input
                id="start_date"
                name="start_date"
                type="date"
                value={form.startDate}
                onChange={(e) => updateField('startDate', e.target.value)}
                className="flex-1 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
              <input
                id="start_time"
                name="start_time"
                type="time"
                value={form.startTime}
                onChange={(e) => updateField('startTime', e.target.value)}
                className="w-36 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="finish_date" className="text-sm font-medium">
              Finish date
            </label>
            <div className="flex gap-2">
              <input
                id="finish_date"
                name="finish_date"
                type="date"
                value={form.finishDate}
                onChange={(e) => updateField('finishDate', e.target.value)}
                className="flex-1 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
              <input
                id="finish_time"
                name="finish_time"
                type="time"
                value={form.finishTime}
                onChange={(e) => updateField('finishTime', e.target.value)}
                className="w-36 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="notes" className="text-sm font-medium">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            value={form.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </div>

        {teamOptions.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Assigned to</span>
            <div className="flex flex-col gap-2 rounded-md border border-surface-border px-3 py-2">
              {teamOptions.map((member) => (
                <label key={member.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="assigned_user_ids" value={member.id} />
                  {member.full_name ?? member.email}
                </label>
              ))}
            </div>
          </div>
        )}

        <button
          type="submit"
          className="mt-2 self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          Create job
        </button>
      </form>
    </div>
  )
}
