'use client'

import { useState } from 'react'
import { deleteGroupAction } from '@/app/actions'

/**
 * Delete a group and everything in it.
 *
 * Every child table cascades from `groups`, so this is not an archive — the
 * expenses go too. An empty group takes one confirming press, since clearing
 * out a mistyped group should not be a ceremony. A group with history makes you
 * type its name, because that one is unrecoverable.
 */
export default function DeleteGroupButton({
  groupId,
  groupName,
  expenseCount,
  settlementCount,
}: {
  groupId: string
  groupName: string
  expenseCount: number
  settlementCount: number
}) {
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasHistory = expenseCount > 0 || settlementCount > 0
  const nameMatches = typed.trim().toLowerCase() === groupName.trim().toLowerCase()
  const canDelete = !hasHistory || nameMatches

  async function handleDelete() {
    if (!canDelete || busy) return
    setBusy(true)
    setError(null)

    const result = await deleteGroupAction(groupId)

    // Success redirects to the dashboard, so anything returned here failed.
    if (result && !result.ok) {
      setError(result.error ?? 'Could not delete the group')
      setBusy(false)
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
        {hasHistory ? (
          <>
            This also deletes {expenseCount} {expenseCount === 1 ? 'expense' : 'expenses'}
            {settlementCount > 0 && (
              <>
                {' '}
                and {settlementCount}{' '}
                {settlementCount === 1 ? 'settlement' : 'settlements'}
              </>
            )}
            . Balances that came from them disappear with them, and none of it can be undone.
          </>
        ) : (
          <>There is nothing in this group yet, so nothing else goes with it.</>
        )}
      </p>

      {hasHistory && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">
            Type <span className="font-semibold">{groupName}</span> to confirm
          </span>
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            className="rounded-xl border border-edge bg-surface px-4 py-3 text-base outline-none focus:border-negative"
          />
        </label>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-negative/10 px-4 py-3 text-sm text-negative">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleDelete}
          disabled={!canDelete || busy}
          className="flex-1 rounded-xl bg-negative px-4 py-3 font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {busy ? 'Deleting…' : 'Delete for everyone'}
        </button>
        <button
          onClick={() => {
            setConfirming(false)
            setTyped('')
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
