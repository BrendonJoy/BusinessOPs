import Link from 'next/link'
import { Button, Field, Input, Notice } from '@/components/ui'
import { login } from './actions'

// Supabase returns "Email not confirmed" for this case. Matched loosely so a
// wording change upstream degrades to no link rather than to a broken page.
function isUnconfirmed(error: string): boolean {
  return /not confirmed/i.test(error)
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>
}) {
  const { error, message } = await searchParams

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Log in</h1>
      <p className="mb-6 text-sm text-muted">Welcome back.</p>

      {message && <Notice className="mb-4">{message}</Notice>}
      {error && (
        <Notice tone="error" className="mb-4">
          {error}
          {/* Without this, an unconfirmed account is a dead end: the address is
              taken so you cannot sign up again, and you cannot log in either. */}
          {isUnconfirmed(error) && (
            <>
              {' '}
              <Link href="/check-email" className="font-medium underline">
                Resend the confirmation email
              </Link>
              .
            </>
          )}
        </Notice>
      )}

      <form action={login} className="flex flex-col gap-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </Field>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs font-medium text-accent">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </div>
        <Button type="submit" variant="primary" className="mt-2">
          Log in
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-medium text-accent">
          Sign up
        </Link>
      </p>
    </div>
  )
}
