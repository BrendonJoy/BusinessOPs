/**
 * Submits one day's entries for approval.
 *
 * This used to read the device's UTC offset and post it, so the button stayed
 * disabled until hydration and a day's boundaries depended on where the phone
 * was. The server now builds the window from the company's timezone, which
 * leaves nothing here that needs the browser — so it is a plain form again.
 */
export default function SubmitDayButton({
  workDate,
  submitAction,
}: {
  workDate: string
  submitAction: (formData: FormData) => void
}) {
  return (
    <form action={submitAction}>
      <input type="hidden" name="work_date" value={workDate} />
      <button
        type="submit"
        className="rounded-md border border-surface-border px-3 py-1.5 text-xs font-medium hover:border-accent disabled:opacity-50"
      >
        Submit for approval
      </button>
    </form>
  )
}
