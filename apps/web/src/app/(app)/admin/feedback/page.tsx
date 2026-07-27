import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform-admin'
import { formatAuditTimestamp } from '@/lib/audit'
import { FEEDBACK_CATEGORY_LABELS, FEEDBACK_STATUSES, FEEDBACK_STATUS_LABELS } from '@trade-assist/db'
import type { FeedbackCategory, FeedbackStatus } from '@trade-assist/db'
import { updateFeedbackStatus } from './actions'

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

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">Feedback inbox</h1>

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
