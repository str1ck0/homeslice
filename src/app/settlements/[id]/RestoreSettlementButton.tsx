'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { restoreSettlementAction } from '@/app/actions'

/** Put back an undone payment. Mirrors RestoreExpenseButton — see it for why. */
export default function RestoreSettlementButton({
  settlementId,
  groupId,
  fromProfileId,
  toProfileId,
}: {
  settlementId: string
  groupId: string | null
  fromProfileId: string
  toProfileId: string
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

    const result = await restoreSettlementAction(settlementId, {
      groupId,
      fromProfileId,
      toProfileId,
    })

    if (!result.ok) {
      running.current = false
      setBusy(false)
      setError(result.error ?? 'Could not restore that payment')
      return
    }

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
        {busy ? 'Restoring…' : 'Restore this payment'}
      </button>
    </div>
  )
}
