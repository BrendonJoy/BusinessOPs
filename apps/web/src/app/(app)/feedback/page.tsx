import { createClient } from '@/lib/supabase/server'
import { formatAuditTimestamp } from '@/lib/audit'
import { FEEDBACK_CATEGORY_LABELS, FEEDBACK_STATUS_LABELS, type FeedbackMessage } from '@trade-assist/db'
import { submitFeedback } from './actions'

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { error, success } = await searchParams
  const supabase = await createClient()

  const { data } = await supabase
    .from('feedback_messages')
    .select('*')
    .order('created_at', { ascending: false })

  const messages = (data ?? []) as FeedbackMessage[]

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">Feedback &amp; support</h1>

      <div className="mb-8 rounded-lg border border-surface-border p-4">
        <p className="mb-3 text-sm text-muted">
          Got a development idea or need help with something? Start your message with{' '}
          <span className="font-medium text-foreground">@idea</span> or{' '}
          <span className="font-medium text-foreground">@support</span>.
        </p>

        {error && <p className="mb-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>}
        {success && (
          <p className="mb-3 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">
            Sent — thanks for the feedback.
          </p>
        )}

        <form action={submitFeedback} className="flex items-end gap-3">
          <textarea
            name="message"
            rows={3}
            required
            placeholder="e.g. &quot;@idea it would be great to have a dark mode toggle&quot; or &quot;@support the invoice PDF is not showing my logo&quot;"
            className="flex-1 rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            Send
          </button>
        </form>
      </div>

      <h2 className="mb-3 text-sm font-medium">Your company&apos;s history</h2>

      {messages.length === 0 ? (
        <p className="text-sm text-muted">No feedback sent yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {messages.map((m) => (
            <li key={m.id} className="rounded-md border border-surface-border p-3 text-sm">
              <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                <span className="inline-flex items-center rounded-full bg-surface px-2 py-0.5 font-medium text-foreground">
                  {FEEDBACK_CATEGORY_LABELS[m.category]}
                </span>
                <span>{formatAuditTimestamp(m.created_at)}</span>
                <span className="ml-auto">{FEEDBACK_STATUS_LABELS[m.status]}</span>
              </div>
              <p>{m.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
