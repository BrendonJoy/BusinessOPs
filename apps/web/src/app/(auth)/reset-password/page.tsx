import ResetPasswordForm from './ResetPasswordForm'

export default function ResetPasswordPage() {
  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Set a new password</h1>
      <p className="mb-6 text-sm text-muted">Choose a new password for your account.</p>
      <ResetPasswordForm />
    </div>
  )
}
