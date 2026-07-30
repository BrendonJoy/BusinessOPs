'use client'

import { useRef, useState } from 'react'

// One styled button per picker, hidden native inputs, auto-submit on
// selection -- replaces the old visible-input + separate-Upload-button
// pairs that showed two "Choose File" controls per upload area.
export default function FileUploadButtons({
  action,
  accept,
  camera = false,
  label = 'Upload file',
  inputName = 'file',
}: {
  action: (formData: FormData) => void
  accept?: string
  camera?: boolean
  label?: string
  inputName?: string
}) {
  const fileFormRef = useRef<HTMLFormElement>(null)
  const cameraFormRef = useRef<HTMLFormElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  function submitOnPick(form: HTMLFormElement | null) {
    if (!form) return
    setIsUploading(true)
    form.requestSubmit()
  }

  const buttonClass =
    'rounded-md border border-surface-border px-4 py-2 text-sm font-medium hover:border-accent disabled:opacity-50'

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form ref={fileFormRef} action={action}>
        <input
          type="file"
          name={inputName}
          accept={accept}
          className="hidden"
          onChange={(e) => e.target.files?.length && submitOnPick(fileFormRef.current)}
        />
        <button
          type="button"
          disabled={isUploading}
          onClick={() => fileFormRef.current?.querySelector('input')?.click()}
          className={buttonClass}
        >
          {isUploading ? 'Uploading…' : label}
        </button>
      </form>

      {camera && (
        <form ref={cameraFormRef} action={action}>
          <input
            type="file"
            name={inputName}
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files?.length && submitOnPick(cameraFormRef.current)}
          />
          <button
            type="button"
            disabled={isUploading}
            onClick={() => cameraFormRef.current?.querySelector('input')?.click()}
            className={buttonClass}
          >
            {isUploading ? 'Uploading…' : 'Take photo'}
          </button>
        </form>
      )}
    </div>
  )
}
