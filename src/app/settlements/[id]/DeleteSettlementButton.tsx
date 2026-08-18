'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteSettlementAction } from '@/app/actions'

/**
 * Undo a payment. Asks first, and asks inline rather than with a browser
 * confirm(), which is unusable inside an installed PWA and blocks the page —
 * the same reasoning as DeleteExpenseButton.
 */
export default function DeleteSettlementButton({
  settlementId,
  groupId,
  fromProfileId,
  toProfileId,
  backHref,
}: {
  settlementId: string
  groupId: string | null
  fromProfileId: string
  toProfileId: string
  backHref: string
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setBusy(true)
    setError(null)

    const result = await deleteSettlementAction(settlementId, {
      groupId,
      fromProfileId,
      toProfileId,
    })

    if (!result.ok) {
      setError(result.error ?? 'Could not undo that payment')
      setBusy(false)
      return
    }

    router.push(backHref)
    router.refresh()
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="mt-2 w-full rounded-xl border border-edge py-3 text-sm font-semibold text-negative transition-colors hover:border-negative"
      >
        Undo payment
      </button>
    )
  }

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-2xl border border-negative/40 bg-negative/5 p-4">
      <p className="text-sm">
        Undo this payment? The debt it cleared comes back, and both of you will
        see that it was undone.
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
          {busy ? 'Undoing…' : 'Yes, undo it'}
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
