'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { recordSettlementAction, updateSettlementAction } from '@/app/actions'
import { formatCents } from '@/core/money'
import { CURRENCY_CODES } from '@/core/currencies'

interface Member {
  id: string
  name: string
}

interface Suggestion {
  fromProfileId: string
  toProfileId: string
  currency: string
  amountCents: number
}

/** What an existing payment looked like when the form opened. */
export interface SettlementDraft {
  id: string
  fromProfileId: string
  toProfileId: string
  amount: string
  currency: string
  method: string
  note: string | null
  settledOn: string
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function SettleForm({
  groupId,
  groupName,
  backHref,
  currentProfileId,
  defaultCurrency,
  members,
  suggestions,
  existing,
}: {
  groupId: string | null
  groupName: string
  /** Where Cancel returns to — a group, or a friend. */
  backHref?: string
  currentProfileId: string
  defaultCurrency: string
  members: Member[]
  suggestions: Suggestion[]
  /** Present when correcting a payment that is already recorded. */
  existing?: SettlementDraft
}) {
  const router = useRouter()
  const nameFor = new Map(members.map((m) => [m.id, m.name]))

  // Default to the debt that actually exists rather than assuming you are the
  // one paying — half the time you are the one being paid.
  const [first] = suggestions

  const [fromProfileId, setFromProfileId] = useState(
    existing?.fromProfileId ?? first?.fromProfileId ?? currentProfileId
  )
  const [toProfileId, setToProfileId] = useState(
    existing?.toProfileId ??
      first?.toProfileId ??
      members.find((m) => m.id !== currentProfileId)?.id ??
      ''
  )
  const [amount, setAmount] = useState(() => {
    if (existing) return existing.amount
    return first ? formatCents(first.amountCents, first.currency, { showSymbol: false }) : ''
  })
  const [currency, setCurrency] = useState(
    existing?.currency ?? first?.currency ?? defaultCurrency
  )
  const [method, setMethod] = useState(existing?.method ?? '')
  const [settledOn, setSettledOn] = useState(existing?.settledOn ?? today())
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const cancelHref = backHref ?? (groupId ? `/groups/${groupId}` : '/friends')
  const doneHref = existing ? `/settlements/${existing.id}` : cancelHref

  function applySuggestion(suggestion: Suggestion) {
    setFromProfileId(suggestion.fromProfileId)
    setToProfileId(suggestion.toProfileId)
    setCurrency(suggestion.currency)
    setAmount(formatCents(suggestion.amountCents, suggestion.currency, { showSymbol: false }))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    // A ref, because setBusy is asynchronous: a second submit fired before
    // React re-renders reads the stale value and records the payment twice.
    if (submitting.current) return
    submitting.current = true

    setBusy(true)
    setError(null)

    const input = {
      groupId,
      fromProfileId,
      toProfileId,
      amount,
      currency,
      method: method || null,
      note: existing?.note ?? null,
      settledOn,
    }

    const result = existing
      ? await updateSettlementAction(existing.id, input)
      : await recordSettlementAction(input)

    if (!result.ok) {
      setError(
        result.error ?? (existing ? 'Could not save that change' : 'Could not record that payment')
      )
      setBusy(false)
      submitting.current = false
      return
    }

    // Land on the payment itself rather than back where you came from, so you
    // can see the thing you just created. Not being able to see it was the
    // whole problem.
    router.push(existing ? `/settlements/${existing.id}` : doneHref)
    router.refresh()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 px-5 py-8"
    >
      <div className="flex items-center gap-3">
        <Link href={cancelHref} className="shrink-0 text-sm text-muted hover:text-ink">
          ← Cancel
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-center text-lg font-semibold">
          {existing ? 'Edit payment' : 'Settle up'}
        </h1>
        {/* Balances the Cancel link so the title sits centred. Matched to it by
            width rather than by a guess, because "← Cancel" is wider than the
            w-14 that used to be here and the title sat visibly off-centre. */}
        <span aria-hidden className="shrink-0 text-sm invisible">
          ← Cancel
        </span>
      </div>

      <p className="text-sm text-muted">
        {existing
          ? 'Correcting a payment changes both balances back to match. Everyone in it sees the change.'
          : `${groupId ? `Record a payment in ${groupName}.` : `Record a payment with ${groupName}.`} This adjusts balances — it doesn’t move real money.`}
      </p>

      {!existing && suggestions.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Outstanding</span>
          {suggestions.map((suggestion, index) => {
            const youPay = suggestion.fromProfileId === currentProfileId
            const other = youPay ? suggestion.toProfileId : suggestion.fromProfileId
            const otherName = nameFor.get(other) ?? 'Someone'
            return (
              <button
                key={index}
                type="button"
                onClick={() => applySuggestion(suggestion)}
                className="flex items-center justify-between gap-3 rounded-xl border border-edge bg-raised p-4 text-left transition-colors hover:border-accent"
              >
                {/* min-w-0 + truncate: a long display name used to push the
                    amount off the edge of a phone screen. */}
                <span className="min-w-0 truncate text-sm">
                  {youPay ? `You pay ${otherName}` : `${otherName} pays you`}
                </span>
                <span className="amount shrink-0 font-semibold text-accent">
                  {formatCents(suggestion.amountCents, suggestion.currency)}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* min-w-0 on every flex child below. Without it a select is never
          allowed to shrink below its longest option and an input never below
          its default size, so a name like "lizzardwizzard" made these rows
          wider than the screen. */}
      <div className="flex gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">From</span>
          <select
            value={fromProfileId}
            onChange={(event) => setFromProfileId(event.target.value)}
            className="h-14 w-full min-w-0 truncate rounded-xl border border-edge bg-raised px-4 text-base outline-none focus:border-accent"
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.id === currentProfileId ? 'You' : member.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">To</span>
          <select
            value={toProfileId}
            onChange={(event) => setToProfileId(event.target.value)}
            className="h-14 w-full min-w-0 truncate rounded-xl border border-edge bg-raised px-4 text-base outline-none focus:border-accent"
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.id === currentProfileId ? 'You' : member.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Same control as the expense form, for the same reason: recording a
          payment and adding an expense ask the same question about money, so
          they should not look like two different apps. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Amount</span>
        <div className="flex items-stretch overflow-hidden rounded-xl border border-edge bg-raised focus-within:border-accent">
          {/* The code sits inside the field rather than beside it: it is a unit,
              not a second question, and giving it its own box stole a third of
              the row from the number that matters. */}
          <div className="relative shrink-0 border-r border-edge">
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              aria-label="Currency"
              className="h-14 appearance-none bg-transparent py-0 pl-4 pr-8 text-base font-medium text-muted outline-none"
            >
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
            <span
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted"
            >
              ▾
            </span>
          </div>

          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
            inputMode="decimal"
            placeholder="0.00"
            className="amount h-14 min-w-0 flex-1 bg-transparent px-4 text-xl font-semibold outline-none"
          />
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Date</span>
        <input
          type="date"
          value={settledOn}
          onChange={(event) => setSettledOn(event.target.value)}
          required
          className="h-14 min-w-0 rounded-xl border border-edge bg-raised px-4 text-base outline-none focus:border-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">
          How? <span className="font-normal text-muted">Optional</span>
        </span>
        <input
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          maxLength={60}
          placeholder="EFT, cash, SnapScan…"
          className="h-14 min-w-0 rounded-xl border border-edge bg-raised px-4 text-base outline-none focus:border-accent"
        />
      </label>

      {error && (
        <p role="alert" className="rounded-xl bg-negative/10 px-4 py-3 text-sm text-negative">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || fromProfileId === toProfileId}
        className="mt-2 rounded-xl bg-accent px-4 py-3.5 font-semibold text-white transition-opacity disabled:opacity-50"
      >
        {busy
          ? existing
            ? 'Saving…'
            : 'Recording…'
          : existing
            ? 'Save changes'
            : 'Record payment'}
      </button>
    </form>
  )
}
