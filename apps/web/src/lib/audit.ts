import type { createClient } from '@/lib/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export async function logJobAudit(supabase: SupabaseClient, jobId: string, action: string) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    await supabase.from('job_audit_log').insert({ job_id: jobId, user_id: user?.id ?? null, action })
  } catch {
    // Best-effort: a logging failure should never break the action it's logging.
  }
}

export function formatAuditTimestamp(iso: string): string {
  const d = new Date(iso)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = String(d.getFullYear()).slice(-2)
  let hours = d.getHours()
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const ampm = hours >= 12 ? 'pm' : 'am'
  hours = hours % 12
  if (hours === 0) hours = 12
  return `${day}/${month}/${year} ${hours}:${minutes}${ampm}`
}
