'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addPlaceholderAction } from '@/app/actions'

/**
 * Add someone who hasn't signed up. They can be split with straight away, and
 * when they eventually register with a matching email the placeholder is
 * claimed and their history comes with them.
 */
export default function AddPersonButton({ groupId }: { groupId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const result = await addPlaceholderAction(groupId, name, email || undefined)
    setBusy(false)

    if (!result.ok) {
      setError(result.error ?? 'Could not add them')
      return
    }

    setName('')
    setEmail('')
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-xl border border-edge py-3 text-sm font-semibold text-accent transition-colors hover:border-accent"
      >
        Add someone who hasn&rsquo;t signed up
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3 rounded-2xl border border-edge bg-raised p-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Their name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={80}
          placeholder="Mum"
          className="rounded-xl border border-edge bg-surface px-4 py-3 text-base outline-none focus:border-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">
          Their email <span className="font-normal text-muted">Optional</span>
        </span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="mum@example.com"
          className="rounded-xl border border-edge bg-surface px-4 py-3 text-base outline-none focus:border-accent"
        />
        <span className="text-xs text-muted">
          If they sign up with this address later, they take over this person and keep the history.
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
          {busy ? 'Adding…' : 'Add them'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border border-edge px-4 py-3 font-semibold text-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
