import { createClient } from '@/lib/supabase/server'
import { acceptInvite } from './actions'

type InviteLookup = {
  email: string
  role: string
  company_name: string | null
  expires_at: string
  accepted_at: string | null
}

export default async function AcceptInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { token } = await params
  const { error } = await searchParams
  const supabase = await createClient()

  const { data } = await supabase.rpc('get_invite_by_token', { p_token: token }).maybeSingle()
  const invite = data as unknown as InviteLookup | null

  const isValid = invite && !invite.accepted_at && new Date(invite.expires_at) > new Date()

  if (!isValid) {
    return (
      <div>
        <h1 className="mb-1 text-xl font-semibold">Invite not available</h1>
        <p className="text-sm text-muted">
          This invite link is invalid, expired, or has already been used. Ask whoever invited you to send a
          new one.
        </p>
      </div>
    )
  }

  const boundAccept = acceptInvite.bind(null, token)

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Join {invite.company_name}</h1>
      <p className="mb-6 text-sm text-muted">
        You&apos;ve been invited to join as a <span className="font-medium text-foreground">{invite.role}</span>.
        Set up your account below.
      </p>

      {error && (
        <p className="mb-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
      )}

      <form action={boundAccept} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Email</label>
          <p className="rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-muted">
            {invite.email}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="full_name" className="text-sm font-medium">
            Your name
          </label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            required
            className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          Join {invite.company_name}
        </button>
      </form>
    </div>
  )
}
