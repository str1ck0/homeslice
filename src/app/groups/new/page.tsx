'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { createGroupAction, joinGroupAction } from '@/app/actions'

/**
 * Suggestions, not a fixed list. The label is free text — someone can type
 * "Beach cottage" or "Book club" and nothing in the app cares.
 */
const LABEL_SUGGESTIONS = ['Sharehouse', 'Flat', 'Trip', 'Couple', 'Family', 'Project']

export default function NewGroupPage() {
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [label, setLabel] = useState('')
  const submitting = useRef(false)

  async function submit(action: (data: FormData) => Promise<{ ok: boolean; error?: string }>, form: FormData) {
    // A ref, not the busy state: setBusy is asynchronous, so a second submit
    // fired before React re-renders still reads the old value and gets through.
    // Double-clicking Create really did make two groups until this was a ref.
    if (submitting.current) return
    submitting.current = true

    setBusy(true)
    setError(null)
    const result = await action(form)

    // Only re-enable on failure. A successful action redirects, and the
    // redirect merely *starts* when the promise settles — clearing busy here
    // put "Create group" back under the cursor while the new page was still
    // loading, so a second press made a second group.
    if (result && !result.ok) {
      setError(result.error ?? 'That did not work')
      setBusy(false)
      submitting.current = false
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-8">
      <Link href="/dashboard" className="mb-6 text-sm text-muted hover:text-ink">
        ← Back
      </Link>

      <div className="mb-6 flex gap-1 rounded-xl bg-raised p-1">
        {(['create', 'join'] as const).map((option) => (
          <button
            key={option}
            onClick={() => setTab(option)}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
              tab === option ? 'bg-accent text-white' : 'text-muted hover:text-ink'
            }`}
          >
            {option === 'create' ? 'Create a group' : 'Join with a code'}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-negative/10 px-4 py-3 text-sm text-negative">
          {error}
        </p>
      )}

      {tab === 'create' ? (
        <form action={(form) => submit(createGroupAction, form)} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Group name</span>
            <input
              name="name"
              required
              maxLength={80}
              placeholder="20 Van Breda Street"
              className="rounded-xl border border-edge bg-raised px-4 py-3 text-base outline-none focus:border-accent"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              What is it? <span className="font-normal text-muted">Optional</span>
            </span>
            <input
              name="label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={60}
              placeholder="Sharehouse"
              className="rounded-xl border border-edge bg-raised px-4 py-3 text-base outline-none focus:border-accent"
            />
            <div className="mt-1 flex flex-wrap gap-1.5">
              {LABEL_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setLabel(suggestion)}
                  className="rounded-full border border-edge px-3 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">
              Just a label — every group can do everything, whatever you call it.
            </p>
          </div>

          <p className="rounded-xl bg-raised px-4 py-3 text-xs text-muted">
            No currency to pick — each expense carries its own, so one group can
            run across as many countries as your trip does.
          </p>

          <button
            type="submit"
            disabled={busy}
            className="mt-2 rounded-xl bg-accent px-4 py-3.5 font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create group'}
          </button>
        </form>
      ) : (
        <form action={(form) => submit(joinGroupAction, form)} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Invite code</span>
            <input
              name="code"
              required
              autoCapitalize="characters"
              placeholder="ABCD2345"
              className="rounded-xl border border-edge bg-raised px-4 py-3 text-center text-xl font-semibold uppercase tracking-[0.3em] outline-none focus:border-accent"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="mt-2 rounded-xl bg-accent px-4 py-3.5 font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Joining…' : 'Join group'}
          </button>
        </form>
      )}
    </div>
  )
}
