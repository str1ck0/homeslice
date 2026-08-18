'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateProfileAction } from '@/app/actions'
import { CURRENCY_CODES } from '@/core/currencies'

/**
 * Your display name and default currency.
 *
 * The currency is the one that matters: it is what every new expense starts in
 * when there is nothing better to go on, so having it stuck on the value you
 * signed up with means fighting the form on every entry abroad.
 */
export default function ProfileFields({
  displayName: initialName,
  defaultCurrency: initialCurrency,
}: {
  displayName: string
  defaultCurrency: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(initialName)
  const [currency, setCurrency] = useState(initialCurrency)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true

    setBusy(true)
    setError(null)

    const result = await updateProfileAction({ displayName: name, defaultCurrency: currency })

    setBusy(false)
    submitting.current = false

    if (!result.ok) {
      setError(result.error ?? 'Could not save your profile')
      return
    }

    setEditing(false)
    setSaved(true)
    router.refresh()
  }

  if (!editing) {
    return (
      <>
        <div className="flex items-center justify-between p-4">
          <span className="text-sm text-muted">Your name</span>
          <div className="flex items-center gap-3">
            <span className="truncate text-sm font-medium">{initialName}</span>
            <button
              onClick={() => {
                setEditing(true)
                setSaved(false)
              }}
              className="shrink-0 text-sm font-medium text-accent"
            >
              Edit
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between p-4">
          <span className="text-sm text-muted">Default currency</span>
          <span className="text-sm font-medium">{initialCurrency}</span>
        </div>

        {saved && (
          <p role="status" className="px-4 pb-3 text-sm font-medium text-positive">
            Saved.
          </p>
        )}
      </>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Your name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          autoFocus
          maxLength={80}
          className="h-14 rounded-xl border border-edge bg-surface px-4 text-base outline-none focus:border-accent"
        />
        <span className="text-xs text-muted">
          What people see, and what they type to add you — so it has to be unique.
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Default currency</span>
        <select
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          className="h-14 rounded-xl border border-edge bg-surface px-4 text-base outline-none focus:border-accent"
        >
          {CURRENCY_CODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">
          Where a new expense starts. A group that has spent in something else suggests that
          instead.
        </span>
      </label>

      {error && (
        <p role="alert" className="rounded-xl bg-negative/10 px-4 py-3 text-sm text-negative">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded-xl bg-accent px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false)
            setName(initialName)
            setCurrency(initialCurrency)
            setError(null)
          }}
          className="rounded-xl border border-edge px-4 py-3 font-semibold text-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
