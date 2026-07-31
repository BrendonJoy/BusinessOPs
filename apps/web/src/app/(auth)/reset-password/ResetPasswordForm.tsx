'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
      {error && <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{error}</p>}

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="confirm" className="text-sm font-medium">
          Confirm new password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          className="rounded-md border border-surface-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  )
}
