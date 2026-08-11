'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteExpenseAction } from '@/app/actions'

/**
 * Deleting changes what everyone owes, so it asks first — and it asks inline
 * rather than with a browser confirm(), which is unusable inside an installed
 * PWA and blocks the page.
 */
export default function DeleteExpenseButton({
  expenseId,
  groupId,
}: {
  expenseId: string
  groupId: string | null
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setBusy(true)
    setError(null)

    const result = await deleteExpenseAction(expenseId, groupId)
    setBusy(false)

    if (!result.ok) {
      setError(result.error ?? 'Could not delete that expense')
      return
    }

    router.push(groupId ? `/groups/${groupId}` : '/dashboard')
    router.refresh()
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="mt-2 w-full rounded-xl border border-edge py-3 text-sm font-semibold text-negative transition-colors hover:border-negative"
      >
        Delete expense
      </button>
    )
  }

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-2xl border border-negative/40 bg-negative/5 p-4">
      <p className="text-sm">
        Delete this expense? Everyone&rsquo;s balance will change to match.
      </p>

      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleDelete}
          disabled={busy}
          className="flex-1 rounded-xl bg-negative px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Deleting…' : 'Yes, delete'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded-xl border border-edge px-4 py-3 font-semibold text-muted"
        >
          Keep it
        </button>
      </div>
    </div>
  )
}
