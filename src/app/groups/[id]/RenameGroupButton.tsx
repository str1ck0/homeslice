'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateGroupAction } from '@/app/actions'

const LABEL_SUGGESTIONS = ['Sharehouse', 'Flat', 'Trip', 'Couple', 'Family', 'Project']

/** Rename a group, or change what it says it is. Admin only. */
export default function RenameGroupButton({
  groupId,
  currentName,
  currentLabel,
}: {
  groupId: string
  currentName: string
  currentLabel: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(currentName)
  const [label, setLabel] = useState(currentLabel ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true

    setBusy(true)
    setError(null)

    const result = await updateGroupAction(groupId, { name, label: label || null })

    setBusy(false)
    submitting.current = false

    if (!result.ok) {
      setError(result.error ?? 'Could not rename the group')
      return
    }

    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-edge py-3 text-sm font-semibold text-accent transition-colors hover:border-accent"
      >
        Rename group
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-edge bg-raised p-4"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Group name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          autoFocus
          maxLength={80}
          className="h-14 rounded-xl border border-edge bg-surface px-4 text-base outline-none focus:border-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">
          What is it? <span className="font-normal text-muted">Optional</span>
        </span>
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={60}
          placeholder="Sharehouse"
          className="h-14 rounded-xl border border-edge bg-surface px-4 text-base outline-none focus:border-accent"
        />
        <div className="mt-1 flex flex-wrap gap-1.5">
          {LABEL_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setLabel(suggestion)}
              className="rounded-full border border-edge px-3 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </label>

      {error && (
        <p role="alert" className="rounded-xl bg-negative/10 px-4 py-3 text-sm text-negative">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded-xl bg-accent px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setName(currentName)
            setLabel(currentLabel ?? '')
            setError(null)
          }}
          className="rounded-xl border border-edge px-4 py-3 font-semibold text-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
