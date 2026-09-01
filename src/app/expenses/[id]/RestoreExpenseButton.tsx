'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { restoreExpenseAction } from '@/app/actions'

/**
 * Bring back a deleted expense.
 *
 * Deliberately not behind a confirmation, unlike deleting. Restoring is the
 * undo of a destructive act and is itself undoable in one click, so asking
 * "are you sure?" would only stand between somebody and fixing a mistake.
 *
 * The `useRef` guard is not decoration: setBusy(false) does not take effect
 * until React re-renders, so a double click gets through the state check and
 * appends two "restored" lines to a history that should record one.
 */
export default function RestoreExpenseButton({
  expenseId,
  groupId,
}: {
  expenseId: string
  groupId: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const running = useRef(false)

  async function handleRestore() {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError(null)

    const result = await restoreExpenseAction(expenseId, groupId)

    if (!result.ok) {
      running.current = false
      setBusy(false)
      setError(result.error ?? 'Could not restore that expense')
      return
    }

    // Left busy on purpose: refresh() has not repainted yet when this resolves,
    // and a button that springs back to life over a stale page invites a
    // second click.
    router.refresh()
  }

  return (
    <div className="mt-2">
      {error && (
        <p role="alert" className="mb-2 text-sm text-negative">
          {error}
        </p>
      )}
      <button
        onClick={handleRestore}
        disabled={busy}
        className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-on-accent transition-opacity disabled:opacity-50"
      >
        {busy ? 'Restoring…' : 'Restore this expense'}
      </button>
    </div>
  )
}
