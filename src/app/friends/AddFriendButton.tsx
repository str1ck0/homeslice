'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addFriendAction } from '@/app/actions'

/**
 * Add someone by the name they go by on Homeslice.
 *
 * One field, because there is only one identity now: your name is unique and is
 * both what people see and what people type to find you. The previous version
 * asked for a username or an email plus a fallback name, and would invent a
 * person who had not signed up — that is gone, so a name that belongs to nobody
 * is simply a miss.
 */
export default function AddFriendButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)

  function close() {
    setOpen(false)
    setError(null)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true

    setBusy(true)
    setError(null)

    const result = await addFriendAction(name)

    setBusy(false)
    submitting.current = false

    if (!result.ok) {
      setError(result.error ?? 'Could not add them')
      return
    }

    setName('')
    close()
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={
          compact
            ? 'rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white'
            : 'mt-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white'
        }
      >
        Add friend
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-edge px-4 py-4">
        <button onClick={close} aria-label="Close" className="w-16 text-left text-2xl leading-none">
          ×
        </button>
        <h2 className="text-base font-semibold">Add friend</h2>
        <span className="w-16" />
      </header>

      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Their name on Homeslice</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={40}
            placeholder="Stricko"
            className="rounded-xl border border-edge bg-raised px-4 py-3 text-base outline-none focus:border-accent"
          />
          <span className="text-xs text-muted">
            Exactly as they have it — capitals and spaces don&rsquo;t matter.
          </span>
        </label>

        <p className="text-center text-sm text-muted text-balance">
          They need a Homeslice account first. Send them the app, then add them once they have
          picked a name.
        </p>

        {error && (
          <p role="alert" className="rounded-xl bg-negative/10 px-4 py-3 text-sm text-negative">
            {error}
          </p>
        )}

        <div className="mt-auto">
          <button
            type="submit"
            disabled={busy || name.trim().length < 2}
            className="w-full rounded-xl bg-accent px-4 py-3.5 font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {busy ? 'Adding…' : 'Add friend'}
          </button>
          <div style={{ height: 'env(safe-area-inset-bottom)' }} />
        </div>
      </form>
    </div>
  )
}
