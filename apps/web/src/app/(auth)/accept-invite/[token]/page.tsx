import { createClient } from '@/lib/supabase/server'
import { Button, Field, Input, Notice } from '@/components/ui'
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
        <Notice tone="error" className="mb-4">
          {error}
        </Notice>
      )}

      <form action={boundAccept} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Email</span>
          <p className="min-h-11 rounded-md border border-surface-border bg-surface px-3 py-2 text-sm text-muted sm:min-h-9">
            {invite.email}
          </p>
        </div>
        <Field label="Your name" htmlFor="full_name">
          <Input id="full_name" name="full_name" type="text" required autoComplete="name" />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters.">
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Field>
        <Button type="submit" variant="primary" className="mt-2">
          Join {invite.company_name}
        </Button>
      </form>
    </div>
  )
}
