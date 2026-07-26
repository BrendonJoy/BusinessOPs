'use client'

import { useRef, useState, useSyncExternalStore } from 'react'
import { parseLineItems, type ParsedLineItem } from './ai-line-item-actions'

function subscribeNoop() {
  return () => {}
}

function getSpeechSupportSnapshot() {
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
}

function getSpeechSupportServerSnapshot() {
  return false
}

type ChatMessage = { role: 'user' | 'assistant'; text: string }

export default function LineItemAssistant({
  onItemsParsed,
}: {
  onItemsParsed: (items: ParsedLineItem[]) => void
}) {
  const [description, setDescription] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isListening, setIsListening] = useState(false)
  const speechSupported = useSyncExternalStore(
    subscribeNoop,
    getSpeechSupportSnapshot,
    getSpeechSupportServerSnapshot
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

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

    const result = await parseLineItems(description)

    if (result.error || !result.data) {
      setParseError(result.error ?? 'Could not parse that.')
      setIsParsing(false)
      return
    }

    onItemsParsed(result.data)
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        text: `Found ${result.data!.length} item${result.data!.length === 1 ? '' : 's'} — review below and add them when ready.`,
      },
    ])
    setDescription('')
    setIsParsing(false)
  }

  return (
    <div className="rounded-md bg-surface p-3">
      <p className="mb-2 text-xs font-medium text-muted">Describe items to add</p>

      {messages.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === 'user'
                  ? 'self-end max-w-[85%] rounded-lg bg-accent px-3 py-2 text-xs text-accent-foreground'
                  : 'self-start max-w-[85%] rounded-lg bg-background px-3 py-2 text-xs'
              }
            >
              {m.text}
            </div>
          ))}
        </div>
      )}

      {parseError && (
        <p className="mb-2 rounded-md bg-accent/10 px-3 py-2 text-xs text-accent">{parseError}</p>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder='e.g. "3.5 hours labour at $90/hr, plus $85 for switchboard parts"'
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
  )
}
