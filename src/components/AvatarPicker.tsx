'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar } from '@/components/ui'
import { uploadAvatar } from '@/lib/upload'

/**
 * Tap a photo to change it.
 *
 * Shared by people and groups because the interaction is identical: the only
 * difference is which action saves the URL, so that is the only thing passed
 * in. `capture` is deliberately unset so the picker offers the library as well
 * as the camera — most profile photos already exist.
 *
 * Uploading happens straight from the browser to storage; only the resulting
 * URL goes through a Server Action.
 */
export default function AvatarPicker({
  name,
  url,
  size = 72,
  onSave,
  editable = true,
}: {
  name: string
  url: string | null
  size?: number
  onSave: (url: string | null) => Promise<{ ok: boolean; error?: string }>
  editable?: boolean
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Shown immediately on pick, so the change feels instant on a slow upload.
  const [preview, setPreview] = useState<string | null>(null)

  async function handleSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const localUrl = URL.createObjectURL(file)
    setPreview(localUrl)
    setBusy(true)
    setError(null)

    try {
      const uploaded = await uploadAvatar(file)
      const result = await onSave(uploaded)
      if (!result.ok) throw new Error(result.error ?? 'Could not save that photo')
      router.refresh()
    } catch (err) {
      setPreview(null)
      setError(err instanceof Error ? err.message : 'Could not save that photo')
    } finally {
      URL.revokeObjectURL(localUrl)
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)

    const result = await onSave(null)
    setBusy(false)

    if (!result.ok) {
      setError(result.error ?? 'Could not remove that photo')
      return
    }

    setPreview(null)
    router.refresh()
  }

  const shown = preview ?? url

  if (!editable) return <Avatar name={name} url={shown} size={size} />

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label={shown ? 'Change photo' : 'Add a photo'}
          className="relative rounded-full transition-opacity disabled:opacity-60"
        >
          <Avatar name={name} url={shown} size={size} />
          <span
            aria-hidden
            className="absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full border-2 border-surface bg-accent text-white"
            style={{ width: size * 0.34, height: size * 0.34, fontSize: size * 0.18 }}
          >
            +
          </span>
        </button>

        <div className="flex flex-col gap-0.5 text-sm">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="text-left font-medium text-accent disabled:opacity-60"
          >
            {busy ? 'Saving…' : shown ? 'Change photo' : 'Add a photo'}
          </button>
          {shown && !busy && (
            <button
              type="button"
              onClick={remove}
              className="text-left text-muted transition-colors hover:text-negative"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleSelect}
        className="hidden"
      />
    </div>
  )
}
