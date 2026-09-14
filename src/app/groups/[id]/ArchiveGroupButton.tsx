'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { setGroupArchivedAction } from '@/app/actions'

/**
 * Archive a group that has history in it, or bring it back.
 *
 * A group with expenses or payments cannot be deleted: deleting it would take
 * them, and the record of them, with it, so the database refuses. Archiving is
 * what "that trip is over" means instead. The group moves to the bottom of
 * everyone's groups list, and every expense, payment and balance stays exactly
 * where it was.
 */
export default function ArchiveGroupButton({
  groupId,
  groupName,
  archived,
}: {
  groupId: string
  groupName: string
  archived: boolean
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)

  async function run() {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setError(null)

    const result = await setGroupArchivedAction(groupId, !archived)

    submitting.current = false
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? 'That did not work')
      return
    }
    setConfirming(false)
    router.refresh()
  }

  // Unarchiving hides nothing and loses nothing, so it takes one press.
  if (archived) {
    return (
      <div className="mt-3">
        <button
          onClick={run}
          disabled={busy}
          className="w-full rounded-xl border border-edge py-3 text-sm font-semibold transition-opacity disabled:opacity-50"
        >
          {busy ? 'Unarchiving…' : 'Unarchive group'}
        </button>
        {error && <p role="alert" className="mt-2 text-sm text-negative">{error}</p>}
      </div>
    )
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="mt-3 w-full rounded-xl border border-edge py-3 text-sm font-semibold transition-colors hover:border-accent"
      >
        Archive group
      </button>
    )
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-edge bg-raised p-4">
      <p className="text-sm font-semibold">Archive {groupName}?</p>
      <p className="text-sm text-muted">
        It moves to Archived at the bottom of the groups list, for everyone in it. Expenses,
        payments and balances stay exactly as they are, and you can unarchive it any time.
      </p>
      <p className="text-sm text-muted">
        It can&rsquo;t be deleted, because it has history: deleting it would delete that too.
      </p>

      {error && (
        <p role="alert" className="rounded-xl bg-negative/10 px-4 py-3 text-sm text-negative">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={run}
          disabled={busy}
          className="flex-1 rounded-xl bg-accent px-4 py-3 font-semibold text-on-accent transition-opacity disabled:opacity-50"
        >
          {busy ? 'Archiving…' : 'Archive for everyone'}
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
