'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { acceptFriendAction, declineFriendRequestAction } from '@/app/actions'

/**
 * Accept or decline a request someone sent you, or withdraw one you sent.
 *
 * On success the row is left disabled until the refresh replaces it, rather
 * than springing back to life over a list that is about to change.
 */
export default function FriendRequestButtons({
  profileId,
  direction,
}: {
  profileId: string
  direction: 'incoming' | 'outgoing'
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)

  async function run(action: (id: string) => Promise<{ ok: boolean; error?: string }>) {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setError(null)

    const result = await action(profileId)

    if (!result.ok) {
      setError(result.error ?? 'That did not work')
      setBusy(false)
      submitting.current = false
      return
    }

    router.refresh()
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex gap-2">
        {direction === 'incoming' ? (
          <>
            <button
              onClick={() => run(declineFriendRequestAction)}
              disabled={busy}
              className="rounded-full border border-edge px-3 py-2 text-sm font-semibold transition-opacity disabled:opacity-50"
            >
              Decline
            </button>
            <button
              onClick={() => run(acceptFriendAction)}
              disabled={busy}
              className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition-opacity disabled:opacity-50"
            >
              Accept
            </button>
          </>
        ) : (
          <button
            onClick={() => run(declineFriendRequestAction)}
            disabled={busy}
            className="rounded-full border border-edge px-3 py-2 text-sm font-semibold transition-opacity disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-negative">
          {error}
        </p>
      )}
    </div>
  )
}
