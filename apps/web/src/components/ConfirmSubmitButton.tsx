'use client'

export default function ConfirmSubmitButton({
  action,
  confirmMessage,
  className,
  children,
}: {
  action: (formData: FormData) => void
  confirmMessage: string
  className?: string
  children: React.ReactNode
}) {
  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (!confirm(confirmMessage)) {
      e.preventDefault()
    }
  }

  return (
    <form action={action}>
      <button type="submit" onClick={handleClick} className={className}>
        {children}
      </button>
    </form>
  )
}
