'use client'

import { useSyncExternalStore } from 'react'

const noopSubscribe = () => () => {}

// The server needs the device's UTC offset to turn the local day into a UTC
// window. useSyncExternalStore keeps SSR (no offset available) and the client
// hydration consistent -- same pattern as the app's other browser-only reads.
function useTimezoneOffset(): number | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => new Date().getTimezoneOffset(),
    () => null
  )
}

export default function SubmitDayButton({
  workDate,
  submitAction,
}: {
  workDate: string
  submitAction: (formData: FormData) => void
}) {
  const tzOffset = useTimezoneOffset()

  return (
    <form action={submitAction}>
      <input type="hidden" name="work_date" value={workDate} />
      <input type="hidden" name="tz_offset_minutes" value={tzOffset ?? ''} />
      <button
        type="submit"
        disabled={tzOffset === null}
        className="rounded-md border border-surface-border px-3 py-1.5 text-xs font-medium hover:border-accent disabled:opacity-50"
      >
        Submit for approval
      </button>
    </form>
  )
}
