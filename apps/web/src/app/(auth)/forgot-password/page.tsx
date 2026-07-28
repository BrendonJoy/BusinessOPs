import Link from 'next/link'
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
        Enter your email and we&apos;ll send you a link to reset your password.
      </p>

      {message && (
        <p className="mb-4 rounded-md bg-surface px-3 py-2 text-sm text-foreground">{message}</p>
      )}
      {error && (
        <p className="mb-4 rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>
      )}

      <form action={requestPasswordReset} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
        >
          Send reset link
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        <Link href="/login" className="font-medium text-accent">
          Back to log in
        </Link>
      </p>
    </div>
  )
}
