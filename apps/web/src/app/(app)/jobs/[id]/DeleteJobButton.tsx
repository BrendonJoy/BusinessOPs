'use client'

export default function DeleteJobButton({
  jobNumber,
  deleteJob,
}: {
  jobNumber: string
  deleteJob: (formData: FormData) => void
}) {
  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (!confirm(`Permanently delete ${jobNumber}? This cannot be undone.`)) {
      e.preventDefault()
    }
  }

  return (
    <form action={deleteJob}>
      <button
        type="submit"
        onClick={handleClick}
        className="self-start text-sm text-accent hover:opacity-80"
      >
        Delete job permanently
      </button>
    </form>
  )
}
