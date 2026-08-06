'use client'

import { useState, useSyncExternalStore } from 'react'
import { inputClasses } from '@/components/ui'

const noop = () => () => {}

/**
 * Picks the business's timezone, defaulting to the one this device reports.
 *
 * Detection is right nearly every time, so the point of showing it is the case
 * where it is not: an admin setting up an account from head office for a venue
 * in another state. Silently detecting and hiding it would leave them with every
 * shift time wrong and nothing on screen to explain why.
 *
 * The list is built on the server and passed in, so the options are in the HTML
 * rather than appearing on hydration — a select that is empty until JS runs is
 * a required field nobody can fill.
 */
export default function TimezoneSelect({
  id,
  name = 'timezone',
  zones,
  current,
}: {
  id: string
  name?: string
  zones: string[]
  /** The stored value, when there is one. Signup has none and detects instead. */
  current?: string | null
}) {
  const [chosen, setChosen] = useState<string | null>(null)

  // '' during the server render. Same pattern as elsewhere in the app for
  // browser-only values: the two renders agree that the server produced nothing,
  // so there is no hydration mismatch to throw the markup away over.
  const detected = useSyncExternalStore(
    noop,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
    () => ''
  )

  const fallback = current ?? (zones.includes(detected) ? detected : '')
  const value = chosen ?? fallback

  return (
    <select
      id={id}
      name={name}
      value={value}
      onChange={(e) => setChosen(e.target.value)}
      className={inputClasses('md', 'max-w-xs')}
    >
      {/* Only ever visible before hydration on signup, where nothing is stored
          and nothing has been detected yet. Selecting it submits nothing and the
          server falls back, which is the same outcome as leaving it alone. */}
      {value === '' && <option value="">Detecting…</option>}
      {zones.map((zone) => (
        <option key={zone} value={zone}>
          {zone.replace(/_/g, ' ')}
        </option>
      ))}
    </select>
  )
}
