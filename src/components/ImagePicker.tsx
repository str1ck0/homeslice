'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Attach photos to an expense — the receipt, the basket, the itemised second
 * page. `capture` is deliberately not set so the picker offers both the camera
 * and the library; forcing the camera is wrong when the receipt is already in
 * your photos.
 */
export default function ImagePicker({
  files,
  onChange,
  max = 6,
}: {
  files: File[]
  onChange: (files: File[]) => void
  max?: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previews, setPreviews] = useState<string[]>([])

  // Object URLs leak if they are not revoked, and a few 4 MB photos add up.
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file))
    setPreviews(urls)
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [files])

  function handleSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? [])
    if (picked.length === 0) return

    onChange([...files, ...picked].slice(0, max))
    // Reset so picking the same file twice in a row still fires onChange.
    event.target.value = ''
  }

  function remove(index: number) {
    onChange(files.filter((_, i) => i !== index))
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">
        Photos <span className="font-normal text-muted">Optional</span>
      </span>

      <div className="flex flex-wrap gap-2">
        {previews.map((url, index) => (
          <div key={url} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Attachment ${index + 1}`}
              className="h-20 w-20 rounded-xl border border-edge object-cover"
            />
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`Remove attachment ${index + 1}`}
              className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-ink text-xs font-bold text-surface"
            >
              ×
            </button>
          </div>
        ))}

        {files.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="grid h-20 w-20 place-items-center rounded-xl border border-dashed border-edge text-sm text-muted transition-colors hover:border-accent hover:text-accent"
          >
            + Photo
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleSelect}
        className="hidden"
      />

      {files.length > 0 && (
        <p className="text-xs text-muted">
          Resized before upload, so a phone photo won&rsquo;t eat your data.
        </p>
      )}
    </div>
  )
}
