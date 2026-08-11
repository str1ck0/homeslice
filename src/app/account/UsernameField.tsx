'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setUsernameAction } from '@/app/actions'

/**
 * Claim a username.
 *
 * This is what makes "add me on Homeslice" a sentence someone can say out
 * loud. Without it the only way to add a friend is their email address, which
 * people mistype and would rather not hand around.
 */
export default function UsernameField({ current }: { current: string | null }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(current ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const result = await setUsernameAction(value)
    setBusy(false)

    if (!result.ok) {
      setError(result.error ?? 'Could not save that username')
      return
    }

    setEditing(false)
    router.refresh()
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <span className="text-sm text-muted">Username</span>
        <span className="text-sm font-medium">
          {current ? `@${current}` : <span className="text-accent">Choose one</span>}
        </span>
      </button>
    )
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3 p-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Username</span>
        <div className="flex items-center gap-2 rounded-xl border border-edge bg-surface px-3">
          <span className="text-muted">@</span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={30}
            placeholder="stricko"
            className="flex-1 bg-transparent py-3 text-base outline-none"
          />
        </div>
        <span className="text-xs text-muted">
          2–30 letters, numbers, dots or underscores. Friends can add you with this.
        </span>
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
            setValue(current ?? '')
            setError(null)
            setEditing(false)
          }}
          className="rounded-xl border border-edge px-4 py-3 font-semibold text-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
