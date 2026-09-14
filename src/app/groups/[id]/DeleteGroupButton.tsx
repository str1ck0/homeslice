'use client'

import { useRef, useState } from 'react'
import { deleteGroupAction } from '@/app/actions'

/**
 * Delete an empty group.
 *
 * Only ever shown for a group with nothing in it — one made by mistake, or
 * named wrong and made again. A group with history gets ArchiveGroupButton
 * instead, because the database will not let it be deleted. One confirming
 * press, since clearing out a mistyped group should not be a ceremony.
 */
export default function DeleteGroupButton({
  groupId,
  groupName,
}: {
  groupId: string
  groupName: string
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)

  async function handleDelete() {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setError(null)

    const result = await deleteGroupAction(groupId)

    // Success redirects to the groups list, so anything returned here failed.
    if (result && !result.ok) {
      setError(result.error ?? 'Could not delete the group')
      setBusy(false)
      submitting.current = false
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="mt-3 w-full rounded-xl border border-edge py-3 text-sm font-semibold text-negative transition-colors hover:border-negative"
      >
        Delete group
      </button>
    )
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-negative/40 bg-negative/5 p-4">
      <p className="text-sm font-semibold">Delete {groupName}?</p>
      <p className="text-sm text-muted">
        There is nothing in this group yet, so nothing else goes with it.
      </p>

      {error && (
        <p role="alert" className="rounded-xl bg-negative/10 px-4 py-3 text-sm text-negative">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleDelete}
          disabled={busy}
          className="flex-1 rounded-xl bg-negative px-4 py-3 font-semibold text-on-negative transition-opacity disabled:opacity-40"
        >
          {busy ? 'Deleting…' : 'Delete for everyone'}
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
