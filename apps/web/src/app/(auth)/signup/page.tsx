import Link from 'next/link'
import { Button, Field, Input, Notice, checkboxClasses } from '@/components/ui'
import { POLICY_PATHS } from '@/lib/policies'
import { signup } from './actions'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Create your account</h1>
      <p className="mb-6 text-sm text-muted">Set up BusinessOps for your business.</p>

      {error && (
        <Notice tone="error" className="mb-4">
          {error}
        </Notice>
      )}

      <form action={signup} className="flex flex-col gap-4">
        <Field label="Company name" htmlFor="company_name">
          <Input id="company_name" name="company_name" type="text" required />
        </Field>
        <Field label="Your name" htmlFor="full_name">
          <Input id="full_name" name="full_name" type="text" required autoComplete="name" />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" required autoComplete="email" />
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
        {/* Unticked by default and required. A pre-ticked box is not agreement,
            and the whole point of the acceptance record is that it means
            something. Opens in a new tab so a half-filled form is not lost. */}
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="accept_privacy"
            required
            className={checkboxClasses('mt-0.5')}
          />
          <span>
            I have read the{' '}
            <Link
              href={POLICY_PATHS.privacy}
              target="_blank"
              rel="noopener"
              className="font-medium text-accent"
            >
              privacy notice
            </Link>{' '}
            and understand how BusinessOps handles my data.
          </span>
        </label>

        <Button type="submit" variant="primary" className="mt-2">
          Sign up
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-accent">
          Log in
        </Link>
      </p>
    </div>
  )
}
