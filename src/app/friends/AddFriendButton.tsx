'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addFriendAction } from '@/app/actions'

/**
 * Add by username or email, with a name as the fallback.
 *
 * Follows the shape Splitwise uses — one identifier field, a name, and an
 * action that stays disabled until there is enough to work with — minus the
 * contacts picker, which needs an address book the browser cannot reach on
 * iOS, and minus the invite promise, since Homeslice sends no email.
 *
 * The reassurance line is deliberately different from Splitwise's "nothing
 * sends just yet": nothing sends at all, ever, and saying so is more useful
 * than implying an invite is coming.
 */
export default function AddFriendButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [identifier, setIdentifier] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A leading @ is how people write a username; only an @ inside the string
  // means an email. Without this, typing "@sam" is read as an email address.
  const isHandle = identifier.trim().startsWith('@')
  const looksLikeEmail = !isHandle && identifier.includes('@')
  const hasIdentifier = identifier.trim() !== ''
  // An email can create a placeholder, so it needs a name. A username must
  // already belong to somebody, so it does not.
  const needsName = !hasIdentifier || looksLikeEmail
  const canSubmit = hasIdentifier ? (!needsName || name.trim() !== '') : name.trim() !== ''

  function close() {
    setOpen(false)
    setError(null)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const result = await addFriendAction(identifier, name || undefined)
    setBusy(false)

    if (!result.ok) {
      setError(result.error ?? 'Could not add them')
      return
    }

    setIdentifier('')
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
          <span className="text-sm font-medium">Username or email</span>
          <input
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode={looksLikeEmail ? 'email' : 'text'}
            placeholder="@sam  or  sam@example.com"
            className="rounded-xl border border-edge bg-raised px-4 py-3 text-base outline-none focus:border-accent"
          />
          <span className="text-xs text-muted">
            {looksLikeEmail
              ? "If nobody's using that email, they'll be added as a placeholder."
              : 'A username finds someone already on Homeslice.'}
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">
            Their name{' '}
            <span className="font-normal text-muted">
              {needsName ? 'Required' : 'Optional'}
            </span>
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            placeholder="Sam"
            className="rounded-xl border border-edge bg-raised px-4 py-3 text-base outline-none focus:border-accent"
          />
        </label>

        <p className="text-center text-sm text-muted text-balance">
          Nothing is sent to them — Homeslice doesn&rsquo;t email anyone. Add them now, split
          straight away, and send them the link yourself when you like.
        </p>

        {error && (
          <p role="alert" className="rounded-xl bg-negative/10 px-4 py-3 text-sm text-negative">
            {error}
          </p>
        )}

        <div className="mt-auto">
          <button
            type="submit"
            disabled={busy || !canSubmit}
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
