'use client'

import { useRef, useState, useSyncExternalStore } from 'react'
import { parseJobDescription } from './ai-actions'
import AddressAutocomplete from '@/components/AddressAutocomplete'

function subscribeNoop() {
  return () => {}
}

function getSpeechSupportSnapshot() {
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
}

function getSpeechSupportServerSnapshot() {
  return false
}

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

type ChatMessage = { role: 'user' | 'assistant'; text: string }

type CustomerOption = {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
}

export default function NewJobForm({
  createJob,
  customers,
}: {
  createJob: (formData: FormData) => void
  customers: CustomerOption[]
}) {
  const [description, setDescription] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isListening, setIsListening] = useState(false)
  const [form, setForm] = useState<FormValues>(EMPTY_FORM)
  const [sameAsCustomerAddress, setSameAsCustomerAddress] = useState(false)
  const [jobGeo, setJobGeo] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null })
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const speechSupported = useSyncExternalStore(
    subscribeNoop,
    getSpeechSupportSnapshot,
    getSpeechSupportServerSnapshot
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

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

  function toggleListening() {
    if (!speechSupported) return

    if (isListening) {
      recognitionRef.current?.stop()
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SpeechRecognitionCtor()
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = false

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript as string
      setDescription((prev) => (prev ? `${prev} ${transcript}` : transcript))
    }
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)

    recognitionRef.current = recognition
    setIsListening(true)
    recognition.start()
  }

  async function handleParse() {
    if (!description.trim()) return
    setIsParsing(true)
    setParseError(null)
    setMessages((prev) => [...prev, { role: 'user', text: description }])

    const result = await parseJobDescription(description)

    if (result.error || !result.data) {
      setParseError(result.error ?? 'Could not parse that.')
      setIsParsing(false)
      return
    }

    const data = result.data
    const parsedName = data.customer_name ?? null
    const match = parsedName
      ? customers.find((c) => c.name.trim().toLowerCase() === parsedName.trim().toLowerCase())
      : undefined
    setSelectedCustomerId(match?.id ?? null)

    setForm((prev) => ({
      customerName: data.customer_name ?? prev.customerName,
      customerEmail: match?.email ?? data.customer_email ?? prev.customerEmail,
      customerPhone: match?.phone ?? data.customer_phone ?? prev.customerPhone,
      customerAddress: match?.address ?? prev.customerAddress,
      addressLine: data.address_line ?? prev.addressLine,
      startDate: data.start_date ?? prev.startDate,
      startTime: data.start_time ?? prev.startTime,
      finishDate: data.finish_date ?? prev.finishDate,
      finishTime: data.finish_time ?? prev.finishTime,
      notes: data.notes ?? prev.notes,
    }))

    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        text: "Here's what I found — review the fields below and create the job when ready.",
      },
    ])
    setDescription('')
    setIsParsing(false)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-surface-border p-4">
        <h2 className="mb-3 text-sm font-medium">Describe the job</h2>

        {messages.length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === 'user'
                    ? 'self-end max-w-[85%] rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground'
                    : 'self-start max-w-[85%] rounded-lg bg-surface px-3 py-2 text-sm'
                }
              >
                {m.text}
              </div>
            ))}
          </div>
        )}

        {parseError && (
          <p className="mb-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{parseError}</p>
        )}

        <div className="flex items-end gap-3">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder='e.g. "Quote booked for tomorrow at 42 Example Street for Jamie Smith, ph 021 555 1234, deck resealing, can do 3pm"'
            className="flex-1 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
          {speechSupported && (
            <button
              type="button"
              onClick={toggleListening}
              className={`rounded-md border px-3 py-2 text-sm font-medium ${
                isListening ? 'border-accent text-accent' : 'border-surface-border hover:border-accent'
              }`}
            >
              {isListening ? 'Listening…' : 'Mic'}
            </button>
          )}
          <button
            type="button"
            onClick={handleParse}
            disabled={isParsing || !description.trim()}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
          >
            {isParsing ? 'Parsing…' : 'Parse with AI'}
          </button>
        </div>
      </div>

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
          <div className="grid grid-cols-2 gap-4">
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

        <div className="grid grid-cols-2 gap-4">
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
                className="w-28 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
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
                className="w-28 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
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
