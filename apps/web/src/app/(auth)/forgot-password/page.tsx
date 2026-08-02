import Link from 'next/link'
import { Button, Field, Input, Notice } from '@/components/ui'
import { requestPasswordReset } from './actions'

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>
}) {
  const { error, message } = await searchParams

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Reset your password</h1>
      <p className="mb-6 text-sm text-muted">
        Enter your email and we&apos;ll send you a code to reset your password.
      </p>

      {message && <Notice className="mb-4">{message}</Notice>}
      {error && (
        <Notice tone="error" className="mb-4">
          {error}
        </Notice>
      )}

      <form action={requestPasswordReset} className="flex flex-col gap-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </Field>
        <Button type="submit" variant="primary" className="mt-2">
          Send reset link
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted">
        <Link href="/login" className="font-medium text-accent">
          Back to log in
        </Link>
      </p>
    </div>
  )
}
