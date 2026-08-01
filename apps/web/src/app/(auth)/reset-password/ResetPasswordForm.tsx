'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button, Field, Input, Notice } from '@/components/ui'

export default function ResetPasswordForm() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>('checking')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const resolvedRef = useRef(false)

  useEffect(() => {
    function markReady() {
      if (!resolvedRef.current) {
        resolvedRef.current = true
        setStatus('ready')
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') markReady()
    })

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) markReady()
    })

    const timeout = setTimeout(() => {
      if (!resolvedRef.current) {
        resolvedRef.current = true
        setStatus('invalid')
      }
    }, 4000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [supabase])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    const formData = new FormData(e.currentTarget)
    const password = String(formData.get('password') ?? '')
    const confirm = String(formData.get('confirm') ?? '')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  if (status === 'checking') {
    return <p className="text-sm text-muted">Checking your reset link…</p>
  }

  if (status === 'invalid') {
    return (
      <p className="text-sm text-muted">
        This reset link is invalid or has expired. Request a new one from the{' '}
        <a href="/forgot-password" className="font-medium text-accent">
          forgot password
        </a>{' '}
        page.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <Notice tone="error">{error}</Notice>}

      <Field label="New password" htmlFor="password" hint="At least 8 characters.">
        <Input id="password" name="password" type="password" required autoComplete="new-password" />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" required autoComplete="new-password" />
      </Field>
      <Button type="submit" variant="primary" disabled={submitting} className="mt-2">
        {submitting ? 'Saving…' : 'Set new password'}
      </Button>
    </form>
  )
}
