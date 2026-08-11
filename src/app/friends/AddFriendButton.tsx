'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addFriendAction } from '@/app/actions'

/**
 * Add by email, with a name as a fallback.
 *
 * If the email belongs to someone already on Homeslice they are linked
 * straight away. If not, a placeholder is created so you can start splitting
 * immediately — they inherit the history when they sign up with that address.
 * Waiting for someone to register before you can record a debt is the sort of
 * friction that makes people go back to a group chat.
 */
export default function AddFriendButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const result = await addFriendAction(email, name || undefined)
    setBusy(false)

    if (!result.ok) {
      setError(result.error ?? 'Could not add them')
      return
    }

    setEmail('')
    setName('')
    setOpen(false)
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
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center">
      <form
        onSubmit={handleSubmit}
        className="w-full rounded-t-2xl border border-edge bg-raised p-5 sm:max-w-sm sm:rounded-2xl"
      >
        <h2 className="text-lg font-semibold">Add a friend</h2>
        <p className="mt-1 text-sm text-muted">
          They don&rsquo;t need an account. Add them now, and they&rsquo;ll pick up the history
          if they sign up later.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Their email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="sam@example.com"
              className="rounded-xl border border-edge bg-surface px-4 py-3 text-base outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              Their name{' '}
              <span className="font-normal text-muted">
                Needed if they&rsquo;re not on Homeslice
              </span>
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              placeholder="Sam"
              className="rounded-xl border border-edge bg-surface px-4 py-3 text-base outline-none focus:border-accent"
            />
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
              {busy ? 'Adding…' : 'Add friend'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-edge px-4 py-3 font-semibold text-muted"
            >
              Cancel
            </button>
          </div>
        </div>

        <div style={{ height: 'env(safe-area-inset-bottom)' }} />
      </form>
    </div>
  )
}
