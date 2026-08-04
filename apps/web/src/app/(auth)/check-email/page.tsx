import Link from 'next/link'
import { Button, Field, Input, Notice } from '@/components/ui'
import { getPendingConfirmationEmail } from '@/lib/pending-confirmation'
import { resendConfirmation } from './actions'

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>
}) {
  const { sent, error } = await searchParams
  const email = await getPendingConfirmationEmail()

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Confirm your email</h1>
      <p className="mb-6 text-sm text-muted">
        {email ? (
          <>
            Your account is created. We&apos;ve sent a confirmation link to{' '}
            <span className="font-medium text-foreground">{email}</span>. Open it and you&apos;re in.
          </>
        ) : (
          <>
            Your account needs confirming before you can log in. Enter your email address and
            we&apos;ll send the link again.
          </>
        )}
      </p>

      {sent && <Notice className="mb-4">If that address needs confirming, a new email is on its way.</Notice>}
      {error && (
        <Notice tone="error" className="mb-4">
          {error}
        </Notice>
      )}

      <form action={resendConfirmation} className="flex flex-col gap-4">
        {/* Only asked for when we don't already know it — someone who just
            signed up should not have to retype their address to get a resend. */}
        {!email && (
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </Field>
        )}
        <Button type="submit" variant={email ? 'secondary' : 'primary'}>
          {email ? 'Resend the email' : 'Send confirmation email'}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted">
        Not arriving? Check your spam folder — it&apos;s the first email we&apos;ve sent you, so it
        can land there.
      </p>

      <p className="mt-4 text-sm text-muted">
        Already confirmed?{' '}
        <Link href="/login" className="font-medium text-accent">
          Log in
        </Link>
      </p>
    </div>
  )
}
