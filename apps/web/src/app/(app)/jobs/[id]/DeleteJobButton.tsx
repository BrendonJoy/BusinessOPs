'use client'

export default function DeleteJobButton({
  jobNumber,
  onDelete,
}: {
  jobNumber: string
  onDelete: () => Promise<void>
}) {
  async function handleClick() {
    if (!confirm(`Permanently delete ${jobNumber}? This cannot be undone.`)) return
    await onDelete()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="self-start text-sm text-accent hover:opacity-80"
    >
      Delete job permanently
    </button>
  )
}
