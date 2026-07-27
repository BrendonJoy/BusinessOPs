import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform-admin'
import { formatAuditTimestamp } from '@/lib/audit'
import {
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
} from '@trade-assist/db'
import type { FeedbackCategory, FeedbackDigest, FeedbackStatus } from '@trade-assist/db'
import { generateFeedbackDigest, updateFeedbackStatus } from './actions'

type AdminFeedbackRow = {
  id: string
  category: FeedbackCategory
  message: string
  ai_summary: string | null
  status: FeedbackStatus
  created_at: string
  company: { name: string } | null
  profile: { full_name: string | null } | null
}

export default async function AdminFeedbackPage() {
  const supabase = await createClient()

  if (!(await isPlatformAdmin(supabase))) {
    redirect('/jobs')
  }

  const { data } = await supabase
    .from('feedback_messages')
    .select('id, category, message, ai_summary, status, created_at, company:companies(name), profile:profiles(full_name)')
    .order('created_at', { ascending: false })

  const messages = (data ?? []) as unknown as AdminFeedbackRow[]
  const newCount = messages.filter((m) => m.status === 'new').length

  const { data: digestData } = await supabase
    .from('feedback_digests')
    .select('*')
    .order('generated_at', { ascending: false })
    .limit(5)

  const digests = (digestData ?? []) as FeedbackDigest[]
  const messageById = new Map(messages.map((m) => [m.id, m]))

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Feedback inbox</h1>

      <section className="mb-8 rounded-lg border border-surface-border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">AI reports</h2>
          <form action={generateFeedbackDigest}>
            <button
              type="submit"
              disabled={newCount === 0}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
            >
              {newCount === 0 ? 'Nothing new to summarize' : `Generate report (${newCount} new)`}
            </button>
          </form>
        </div>

        {digests.length === 0 ? (
          <p className="text-sm text-muted">No reports generated yet.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {digests.map((d) => (
              <li key={d.id} className="rounded-md bg-surface p-3 text-sm">
                <div className="mb-2 flex items-center gap-2 text-xs text-muted">
                  <span>{formatAuditTimestamp(d.generated_at)}</span>
                  <span>— {d.message_count} message(s)</span>
                </div>
                <p className="mb-2">{d.summary}</p>
                {d.urgent_items.length > 0 && (
                  <div className="rounded-md bg-accent/10 p-2">
                    <p className="mb-1 text-xs font-medium text-accent">Urgent</p>
                    <ul className="flex flex-col gap-1">
                      {d.urgent_items.map((item, i) => (
                        <li key={i} className="text-xs">
                          <span className="font-medium">
                            {messageById.get(item.message_id)?.company?.name ?? 'Unknown company'}:
                          </span>{' '}
                          {item.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {messages.length === 0 ? (
        <p className="text-sm text-muted">No feedback yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {messages.map((m) => (
            <li key={m.id} className="rounded-lg border border-surface-border p-4 text-sm">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="inline-flex items-center rounded-full bg-surface px-2 py-0.5 font-medium text-foreground">
                  {FEEDBACK_CATEGORY_LABELS[m.category]}
                </span>
                <span className="font-medium text-foreground">{m.company?.name ?? 'Unknown company'}</span>
                <span>{m.profile?.full_name ?? 'Unknown user'}</span>
                <span>{formatAuditTimestamp(m.created_at)}</span>
                <form action={updateFeedbackStatus.bind(null, m.id)} className="ml-auto flex items-center gap-2">
                  <select
                    name="status"
                    defaultValue={m.status}
                    className="rounded-md border border-surface-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
                  >
                    {FEEDBACK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {FEEDBACK_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="text-xs text-accent hover:opacity-80">
                    Update
                  </button>
                </form>
              </div>
              <p className="mb-1">{m.message}</p>
              {m.ai_summary && <p className="text-xs text-muted">AI summary: {m.ai_summary}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
