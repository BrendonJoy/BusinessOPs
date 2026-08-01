import Link from 'next/link'
import { Button, Field, Input, Notice } from '@/components/ui'
import { login } from './actions'

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
