'use client'

import { useRef, useState } from 'react'
import { removeFriendAction } from '@/app/actions'

/**
 * Remove a friend.
 *
 * Only the friendship goes — shared expenses and any group you are both in stay
 * exactly as they were, which is worth saying on the button's confirmation
 * because "remove" reads like it might take the history too.
 */
export default function RemoveFriendButton({
  profileId,
  displayName,
}: {
  profileId: string
  displayName: string
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)

  async function handleRemove() {
    if (submitting.current) return
    submitting.current = true

    setBusy(true)
    setError(null)

    const result = await removeFriendAction(profileId)

    // Success redirects to /friends, so anything returned here failed.
    if (result && !result.ok) {
      setError(result.error ?? 'Could not remove them')
      setBusy(false)
      submitting.current = false
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="mt-2 w-full rounded-xl border border-edge py-3 text-sm font-semibold text-negative transition-colors hover:border-negative"
      >
        Remove friend
      </button>
    )
  }

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-2xl border border-negative/40 bg-negative/5 p-4">
      <p className="text-sm font-semibold">Remove {displayName}?</p>
      <p className="text-sm text-muted">
        They come off your friends list. Expenses you have shared stay, and so does any group
        you are both in — you can add them again any time.
      </p>

      {error && (
        <p role="alert" className="rounded-xl bg-negative/10 px-4 py-3 text-sm text-negative">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleRemove}
          disabled={busy}
          className="flex-1 rounded-xl bg-negative px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Removing…' : 'Remove'}
        </button>
        <button
          onClick={() => {
            setConfirming(false)
            setError(null)
          }}
          className="rounded-xl border border-edge px-4 py-3 font-semibold text-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
