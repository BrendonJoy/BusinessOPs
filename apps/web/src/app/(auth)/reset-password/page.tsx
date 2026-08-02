import ResetPasswordForm from './ResetPasswordForm'

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  // Carried over from /forgot-password so the code is the only thing to type.
  const { email } = await searchParams

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Set a new password</h1>
      <p className="mb-6 text-sm text-muted">
        Enter the code we emailed you, then choose a new password.
      </p>
      <ResetPasswordForm initialEmail={email ?? ''} />
    </div>
  )
}
