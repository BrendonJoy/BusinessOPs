'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

type Suggestion = { placeId: string; description: string }
type ValueChange = { address: string; lat: number | null; lng: number | null }

function subscribeNoop() {
  return () => {}
}

function getGeolocationSupportSnapshot() {
  return 'geolocation' in navigator
}

function getGeolocationSupportServerSnapshot() {
  return false
}

export default function AddressAutocomplete({
  id,
  name,
  geoLatName,
  geoLngName,
  defaultValue,
  defaultLat,
  defaultLng,
  className,
  onValueChange,
}: {
  id?: string
  name: string
  geoLatName?: string
  geoLngName?: string
  defaultValue?: string
  defaultLat?: number | null
  defaultLng?: number | null
  className?: string
  onValueChange?: (value: ValueChange) => void
}) {
  const [text, setText] = useState(defaultValue ?? '')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [lat, setLat] = useState<number | null>(defaultLat ?? null)
  const [lng, setLng] = useState<number | null>(defaultLng ?? null)
  const [isLocating, setIsLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const sessionTokenRef = useRef<string>(crypto.randomUUID())
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const geolocationSupported = useSyncExternalStore(
    subscribeNoop,
    getGeolocationSupportSnapshot,
    getGeolocationSupportServerSnapshot
  )

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
    onValueChange?.({ address: value, lat: null, lng: null })

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
      onValueChange?.({ address: details.formattedAddress, lat: details.lat, lng: details.lng })
    }

    sessionTokenRef.current = crypto.randomUUID()
  }

  function handleUseLocation() {
    setLocationError(null)
    setIsLocating(true)

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        const res = await fetch(`/api/geocode?lat=${latitude}&lng=${longitude}`)
        if (res.ok) {
          const data = await res.json()
          setText(data.address)
          setLat(latitude)
          setLng(longitude)
          onValueChange?.({ address: data.address, lat: latitude, lng: longitude })
        } else {
          setLocationError("Couldn't resolve an address for your location.")
        }
        setIsLocating(false)
      },
      () => {
        setLocationError('Could not access your location.')
        setIsLocating(false)
      }
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2">
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
        {geoLatName && <input type="hidden" name={geoLatName} value={lat ?? ''} />}
        {geoLngName && <input type="hidden" name={geoLngName} value={lng ?? ''} />}

        {geolocationSupported && (
          <button
            type="button"
            onClick={handleUseLocation}
            disabled={isLocating}
            title="Use my current location"
            className="shrink-0 rounded-md border border-surface-border px-3 py-2 text-sm hover:border-accent disabled:opacity-50"
          >
            {isLocating ? '…' : '📍'}
          </button>
        )}
      </div>

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
      {locationError && <p className="mt-1 text-xs text-accent">{locationError}</p>}
    </div>
  )
}
