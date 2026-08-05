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
  // Refs to the file inputs themselves, rather than finding them from the form.
  //
  // This used to be `form.querySelector('input')`, which picked up the hidden
  // `$ACTION_REF_*` input that Next injects into every server-action form — it
  // sits ahead of ours in the DOM. So the button clicked that instead, the
  // picker never opened, and both buttons appeared to do nothing at all.
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
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
        {/* sr-only rather than `hidden`: a display:none file input does not
            reliably open the picker on iOS Safari, and this is used from a
            phone on site more than from a desk. */}
        <input
          ref={fileInputRef}
          type="file"
          name={inputName}
          accept={accept}
          className="sr-only"
          onChange={(e) => e.target.files?.length && submitOnPick(fileFormRef.current)}
        />
        <button
          type="button"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
          className={buttonClass}
        >
          {isUploading ? 'Uploading…' : label}
        </button>
      </form>

      {camera && (
        <form ref={cameraFormRef} action={action}>
          <input
            ref={cameraInputRef}
            type="file"
            name={inputName}
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => e.target.files?.length && submitOnPick(cameraFormRef.current)}
          />
          <button
            type="button"
            disabled={isUploading}
            onClick={() => cameraInputRef.current?.click()}
            className={buttonClass}
          >
            {isUploading ? 'Uploading…' : 'Take photo'}
          </button>
        </form>
      )}
    </div>
  )
}
