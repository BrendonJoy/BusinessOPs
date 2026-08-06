'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { inputClasses } from '@/components/ui'

type Message = { role: 'user' | 'assistant'; content: string }

const subscribeNoop = () => () => {}
const getSpeechSupportSnapshot = () =>
  'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
const getSpeechSupportServerSnapshot = () => false

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const transcriptRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  const speechSupported = useSyncExternalStore(
    subscribeNoop,
    getSpeechSupportSnapshot,
    getSpeechSupportServerSnapshot
  )

  useEffect(() => {
    if (!open || loaded) return
    fetch('/api/chat')
      .then((res) => (res.ok ? res.json() : { messages: [] }))
      .then((data) => {
        setMessages((data.messages ?? []).map((m: Message) => ({ role: m.role, content: m.content })))
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [open, loaded])

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight })
  }, [messages, sending, open])

  async function send() {
    const message = input.trim()
    if (!message || sending) return

    setInput('')
    setSending(true)
    setMessages((prev) => [...prev, { role: 'user', content: message }])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The server has no idea where the user is. Creating a shift means
        // turning "Friday 6pm" into an instant, and doing that server-side
        // would use UTC and put every shift half a day out.
        body: JSON.stringify({
          message,
          tzOffsetMinutes: new Date().getTimezoneOffset(),
          localDate: new Date().toLocaleDateString('en-CA'),
        }),
      })
      const data = await res.json().catch(() => null)
      const reply = res.ok && data?.reply ? data.reply : 'Sorry — something went wrong. Try again.'
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry — something went wrong. Try again.' }])
    }

    setSending(false)
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
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript))
    }
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)

    recognitionRef.current = recognition
    setIsListening(true)
    recognition.start()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open assistant"
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-xl text-accent-foreground shadow-lg hover:opacity-90"
      >
        💬
      </button>
    )
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-surface-border bg-background shadow-xl sm:w-96">
      <div className="border-b border-surface-border px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Assistant</h2>
          <button onClick={() => setOpen(false)} className="text-sm text-muted hover:text-foreground">
            ✕ Close
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">
          Ask about your schedule, create jobs, add quote items, plan routes — or send the developers
          feedback with @idea / @support.
        </p>
      </div>

      <div ref={transcriptRef} className="flex-1 overflow-y-auto px-4 py-3">
        {!loaded ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted">No messages yet — say hello!</p>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'self-end bg-accent text-accent-foreground'
                    : 'self-start bg-surface'
                }`}
              >
                {m.content}
              </div>
            ))}
            {sending && (
              <div className="self-start rounded-lg bg-surface px-3 py-2 text-sm text-muted">Thinking…</div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-surface-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            rows={2}
            placeholder="Message the assistant…"
            className={inputClasses('md', 'flex-1 resize-none')}
          />
          {speechSupported && (
            <button
              onClick={toggleListening}
              aria-label={isListening ? 'Stop dictating' : 'Dictate'}
              className={`rounded-md border px-3 py-2 text-sm ${
                isListening ? 'border-accent bg-accent/10 text-accent' : 'border-surface-border hover:border-accent'
              }`}
            >
              🎤
            </button>
          )}
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
