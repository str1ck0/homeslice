'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { recordSettlementAction } from '@/app/actions'
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

export default function SettleForm({
  groupId,
  groupName,
  backHref,
  currentProfileId,
  defaultCurrency,
  members,
  suggestions,
}: {
  groupId: string | null
  groupName: string
  /** Where Cancel returns to — a group, or a friend. */
  backHref?: string
  currentProfileId: string
  defaultCurrency: string
  members: Member[]
  suggestions: Suggestion[]
}) {
  const router = useRouter()
  const nameFor = new Map(members.map((m) => [m.id, m.name]))

  // Default to the debt that actually exists rather than assuming you are the
  // one paying — half the time you are the one being paid.
  const [first] = suggestions

  const [fromProfileId, setFromProfileId] = useState(
    first?.fromProfileId ?? currentProfileId
  )
  const [toProfileId, setToProfileId] = useState(
    first?.toProfileId ?? members.find((m) => m.id !== currentProfileId)?.id ?? ''
  )
  const [amount, setAmount] = useState(() =>
    first ? formatCents(first.amountCents, first.currency, { showSymbol: false }) : ''
  )
  const [currency, setCurrency] = useState(first?.currency ?? defaultCurrency)
  const [method, setMethod] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function applySuggestion(suggestion: Suggestion) {
    setFromProfileId(suggestion.fromProfileId)
    setToProfileId(suggestion.toProfileId)
    setCurrency(suggestion.currency)
    setAmount(formatCents(suggestion.amountCents, suggestion.currency, { showSymbol: false }))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const result = await recordSettlementAction({
      groupId,
      fromProfileId,
      toProfileId,
      amount,
      currency,
      method: method || null,
      note: null,
    })

    setBusy(false)

    if (!result.ok) {
      setError(result.error ?? 'Could not record that payment')
      return
    }

    router.push(backHref ?? (groupId ? `/groups/${groupId}` : '/friends'))
    router.refresh()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-5 py-8"
    >
      <div className="flex items-center justify-between">
        <Link
          href={backHref ?? (groupId ? `/groups/${groupId}` : '/friends')}
          className="text-sm text-muted hover:text-ink"
        >
          ← Cancel
        </Link>
        <h1 className="text-lg font-semibold">Settle up</h1>
        <span className="w-14" />
      </div>

      <p className="text-sm text-muted">
        {groupId ? `Record a payment in ${groupName}.` : `Record a payment with ${groupName}.`} This
        adjusts balances — it doesn&rsquo;t move real money.
      </p>

      {suggestions.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Outstanding</span>
          {suggestions.map((suggestion, index) => {
            const youPay = suggestion.fromProfileId === currentProfileId
            const other = youPay ? suggestion.toProfileId : suggestion.fromProfileId
            return (
              <button
                key={index}
                type="button"
                onClick={() => applySuggestion(suggestion)}
                className="flex items-center justify-between gap-3 rounded-xl border border-edge bg-raised p-4 text-left transition-colors hover:border-accent"
              >
                <span className="text-sm">
                  {youPay ? 'You pay' : `${nameFor.get(other) ?? 'Someone'} pays you`}
                  {youPay && ` ${nameFor.get(other) ?? 'someone'}`}
                </span>
                <span className="amount font-semibold text-accent">
                  {formatCents(suggestion.amountCents, suggestion.currency)}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">From</span>
          <select
            value={fromProfileId}
            onChange={(event) => setFromProfileId(event.target.value)}
            className="rounded-xl border border-edge bg-raised px-3 py-3 text-base outline-none focus:border-accent"
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.id === currentProfileId ? 'You' : member.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">To</span>
          <select
            value={toProfileId}
            onChange={(event) => setToProfileId(event.target.value)}
            className="rounded-xl border border-edge bg-raised px-3 py-3 text-base outline-none focus:border-accent"
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.id === currentProfileId ? 'You' : member.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Amount</span>
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
            inputMode="decimal"
            placeholder="0.00"
            className="amount rounded-xl border border-edge bg-raised px-4 py-3 text-xl font-semibold outline-none focus:border-accent"
          />
        </label>
        <label className="flex w-28 flex-col gap-1.5">
          <span className="text-sm font-medium">Currency</span>
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            className="rounded-xl border border-edge bg-raised px-3 py-3 text-base outline-none focus:border-accent"
          >
            {CURRENCY_CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">
          How? <span className="font-normal text-muted">Optional</span>
        </span>
        <input
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          maxLength={60}
          placeholder="EFT, cash, SnapScan…"
          className="rounded-xl border border-edge bg-raised px-4 py-3 text-base outline-none focus:border-accent"
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
        className="mt-2 rounded-xl bg-accent px-4 py-3.5 font-semibold text-white disabled:opacity-40"
      >
        {busy ? 'Recording…' : 'Record payment'}
      </button>
    </form>
  )
}
