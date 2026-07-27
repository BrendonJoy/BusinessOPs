'use client'

import { useEffect, useRef, useState } from 'react'

type Suggestion = { placeId: string; description: string }

export default function AddressAutocomplete({
  id,
  name,
  geoLatName,
  geoLngName,
  defaultValue,
  defaultLat,
  defaultLng,
  className,
}: {
  id?: string
  name: string
  geoLatName: string
  geoLngName: string
  defaultValue?: string
  defaultLat?: number | null
  defaultLng?: number | null
  className?: string
}) {
  const [text, setText] = useState(defaultValue ?? '')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [lat, setLat] = useState<number | null>(defaultLat ?? null)
  const [lng, setLng] = useState<number | null>(defaultLng ?? null)
  const sessionTokenRef = useRef<string>(crypto.randomUUID())
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleTextChange(value: string) {
    setText(value)
    setLat(null)
    setLng(null)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.trim().length < 3) {
      setSuggestions([])
      setIsOpen(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      const res = await fetch(
        `/api/places/autocomplete?input=${encodeURIComponent(value)}&sessionToken=${sessionTokenRef.current}`
      )
      const data = await res.json()
      setSuggestions(data.suggestions ?? [])
      setIsOpen(true)
    }, 300)
  }

  async function handleSelect(suggestion: Suggestion) {
    setText(suggestion.description)
    setIsOpen(false)
    setSuggestions([])

    const res = await fetch(
      `/api/places/details?placeId=${suggestion.placeId}&sessionToken=${sessionTokenRef.current}`
    )
    if (res.ok) {
      const details = await res.json()
      setText(details.formattedAddress)
      setLat(details.lat)
      setLng(details.lng)
    }

    sessionTokenRef.current = crypto.randomUUID()
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        name={name}
        type="text"
        autoComplete="off"
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setIsOpen(true)}
        className={
          className ??
          'w-full rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none'
        }
      />
      <input type="hidden" name={geoLatName} value={lat ?? ''} />
      <input type="hidden" name={geoLngName} value={lng ?? ''} />

      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-md border border-surface-border bg-background shadow-lg">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onClick={() => handleSelect(s)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-surface"
              >
                {s.description}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
