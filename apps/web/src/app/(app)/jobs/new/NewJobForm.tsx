'use client'

import { useRef, useState, useSyncExternalStore } from 'react'
import { parseJobDescription } from './ai-actions'

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
  finishDate: string
  notes: string
}

const EMPTY_FORM: FormValues = {
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  customerAddress: '',
  addressLine: '',
  startDate: '',
  finishDate: '',
  notes: '',
}

type ChatMessage = { role: 'user' | 'assistant'; text: string }

export default function NewJobForm({
  createJob,
  customers,
}: {
  createJob: (formData: FormData) => void
  customers: { name: string }[]
}) {
  const [description, setDescription] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isListening, setIsListening] = useState(false)
  const [form, setForm] = useState<FormValues>(EMPTY_FORM)
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
    setForm((prev) => ({
      customerName: data.customer_name ?? prev.customerName,
      customerEmail: data.customer_email ?? prev.customerEmail,
      customerPhone: data.customer_phone ?? prev.customerPhone,
      customerAddress: prev.customerAddress,
      addressLine: data.address_line ?? prev.addressLine,
      startDate: data.start_date ?? prev.startDate,
      finishDate: data.finish_date ?? prev.finishDate,
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
              onChange={(e) => updateField('customerName', e.target.value)}
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
            <datalist id="customer-names">
              {customers.map((c) => (
                <option key={c.name} value={c.name} />
              ))}
            </datalist>
            <p className="text-xs text-muted">Matches an existing customer by name, or creates a new one.</p>
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
            <input
              id="customer_address"
              name="customer_address"
              type="text"
              value={form.customerAddress}
              onChange={(e) => updateField('customerAddress', e.target.value)}
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
        </fieldset>

        <div className="flex flex-col gap-1">
          <label htmlFor="address_line" className="text-sm font-medium">
            Job address
          </label>
          <input
            id="address_line"
            name="address_line"
            type="text"
            value={form.addressLine}
            onChange={(e) => updateField('addressLine', e.target.value)}
            className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="start_date" className="text-sm font-medium">
              Start date
            </label>
            <input
              id="start_date"
              name="start_date"
              type="date"
              value={form.startDate}
              onChange={(e) => updateField('startDate', e.target.value)}
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="finish_date" className="text-sm font-medium">
              Finish date
            </label>
            <input
              id="finish_date"
              name="finish_date"
              type="date"
              value={form.finishDate}
              onChange={(e) => updateField('finishDate', e.target.value)}
              className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
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
