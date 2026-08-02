'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button, Field, Input, Notice } from '@/components/ui'

/**
 * Password reset by emailed code rather than by emailed link.
 *
 * Links do not survive contact with corporate mail scanning. Microsoft Defender
 * Safe Links — which covers Outlook, Hotmail and Office 365, i.e. a large share
 * of our users — fetches every URL in an inbound message to check it. Supabase
 * recovery links are single use, so the scanner spends the token and the real
 * click always lands on "invalid or has expired".
 *
 * A code cannot be spent by something merely reading the email.
 *
 * The length is NOT hard-coded. Supabase's email OTP length is a project
 * setting; this project issues 8 digits, not the documented default of 6, and
 * an exact-length check silently rejected every real code. Accept a range so
 * changing that setting cannot break the form again.
 */
const CODE_PATTERN = /^\d{4,10}$/
export default function ResetPasswordForm({ initialEmail }: { initialEmail: string }) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [email, setEmail] = useState(initialEmail)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    const formData = new FormData(e.currentTarget)
    const code = String(formData.get('code') ?? '').replace(/\s/g, '')
    const password = String(formData.get('password') ?? '')
    const confirm = String(formData.get('confirm') ?? '')

    if (!email.trim()) {
      setError('Enter the email address you requested the code for.')
      return
    }
    if (!CODE_PATTERN.test(code)) {
      setError('Enter the code from your email — digits only.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)

    // Exchanges the code for a session. Wrong or expired codes fail here.
    const { error: otpError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code,
      type: 'recovery',
    })

    if (otpError) {
      setSubmitting(false)
      setError(
        otpError.message.toLowerCase().includes('expired')
          ? 'That code has expired. Request a new one.'
          : 'That code is not right. Check it and try again.',
      )
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <Notice tone="error">{error}</Notice>}

      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>

      <Field label="Verification code" htmlFor="code" hint="From the email we just sent you.">
        <Input
          id="code"
          name="code"
          type="text"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={10}
          placeholder="Code from your email"
          className="tracking-[0.3em]"
        />
      </Field>

      <Field label="New password" htmlFor="password" hint="At least 8 characters.">
        <Input id="password" name="password" type="password" required autoComplete="new-password" />
      </Field>

      <Field label="Confirm new password" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" required autoComplete="new-password" />
      </Field>

      <Button type="submit" variant="primary" disabled={submitting} className="mt-2">
        {submitting ? 'Saving…' : 'Set new password'}
      </Button>

      <p className="text-sm text-muted">
        Didn&apos;t get a code?{' '}
        <Link href="/forgot-password" className="font-medium text-accent">
          Send another
        </Link>
      </p>
    </form>
  )
}
