'use client'

import { useMemo, useState } from 'react'
import { Avatar } from '@/components/ui'
import { SPLIT_TYPES, splitExpense, type SplitType } from '@/core/split'
import { formatCents, parseAmountToCents } from '@/core/money'

export interface Member {
  id: string
  name: string
}

export interface SplitState {
  payerId: string
  splitType: SplitType
  selected: string[]
  weights: Record<string, string>
}

const SPLIT_LABELS: Record<SplitType, string> = {
  equal: 'Equally',
  exact: 'Exact amounts',
  percent: 'Percentages',
  shares: 'Shares',
  adjustment: 'Plus / minus',
}

const SPLIT_HINTS: Record<SplitType, string> = {
  equal: 'Everyone selected pays the same.',
  exact: 'Type what each person owes. Must add up to the total.',
  percent: 'Type each share as a percentage. Must add up to 100.',
  shares: 'Two shares pays twice as much as one.',
  adjustment: 'A fixed amount off each person, then the rest splits equally.',
}

/**
 * Choosing who paid and how it splits, in one step.
 *
 * Splitwise's insight, borrowed deliberately: almost every expense is one of a
 * handful of arrangements, and naming them in a sentence with the money spelled
 * out beats making somebody assemble the same thing from a payer dropdown and a
 * split-type grid. Two controls became one, and the common case is a single tap.
 *
 * Every shortcut is expressed with the split types that already existed —
 * "owed the full amount" is an equal split with the payer left out of the
 * participants, which the service already handles by giving a payer who owes
 * nothing a row with `paid_cents` and no share.
 */
export default function SplitChooser({
  members,
  currentProfileId,
  currency,
  amount,
  value,
  onChange,
}: {
  members: Member[]
  currentProfileId: string
  currency: string
  /** Raw amount as typed; the consequence lines stay blank until it parses. */
  amount: string
  value: SplitState
  onChange: (next: SplitState) => void
}) {
  const [open, setOpen] = useState(false)
  const [advanced, setAdvanced] = useState(false)

  const others = members.filter((m) => m.id !== currentProfileId)
  const me = members.find((m) => m.id === currentProfileId)

  const totalCents = useMemo(() => {
    if (!amount.trim()) return null
    try {
      const cents = parseAmountToCents(amount, currency)
      return cents > 0 ? cents : null
    } catch {
      return null
    }
  }, [amount, currency])

  const nameOf = (id: string) =>
    id === currentProfileId ? 'you' : (members.find((m) => m.id === id)?.name ?? 'someone')

  /** The arrangements worth naming, in the order people reach for them. */
  const shortcuts = useMemo(() => {
    if (members.length < 2) return []

    const everyone = members.map((m) => m.id)
    const list: { key: string; label: string; state: SplitState }[] = []

    const equal = (payerId: string, selected: string[]): SplitState => ({
      payerId,
      splitType: 'equal',
      selected,
      weights: {},
    })

    list.push({
      key: 'me-equal',
      label: 'You paid, split equally',
      state: equal(currentProfileId, everyone),
    })
    list.push({
      key: 'me-full',
      label: 'You are owed the full amount',
      state: equal(
        currentProfileId,
        everyone.filter((id) => id !== currentProfileId)
      ),
    })

    for (const other of others) {
      list.push({
        key: `${other.id}-equal`,
        label: `${other.name} paid, split equally`,
        state: equal(other.id, everyone),
      })

      // Only worth offering for two people; in a group it is a rare
      // arrangement and the list would double in length for it.
      if (members.length === 2) {
        list.push({
          key: `${other.id}-full`,
          label: `${other.name} is owed the full amount`,
          state: equal(
            other.id,
            everyone.filter((id) => id !== other.id)
          ),
        })
      }
    }

    return list
  }, [members, others, currentProfileId])

  /** What a given arrangement means for you, in money. */
  function consequence(state: SplitState): { text: string; owed: boolean } | null {
    if (totalCents === null || state.selected.length === 0) return null

    let shares
    try {
      shares = splitExpense(
        'equal',
        totalCents,
        state.selected.map((id) => ({ profileId: id }))
      )
    } catch {
      return null
    }

    const myShare = shares.find((s) => s.profileId === currentProfileId)?.owedCents ?? 0

    if (state.payerId === currentProfileId) {
      const owedToMe = totalCents - myShare
      if (owedToMe === 0) return null
      return {
        text:
          members.length === 2
            ? `${others[0]?.name ?? 'They'} owes you ${formatCents(owedToMe, currency)}`
            : `You are owed ${formatCents(owedToMe, currency)}`,
        owed: true,
      }
    }

    if (myShare === 0) return { text: 'Nothing changes for you', owed: true }

    return {
      text: `You owe ${nameOf(state.payerId)} ${formatCents(myShare, currency)}`,
      owed: false,
    }
  }

  function matches(state: SplitState): boolean {
    return (
      state.payerId === value.payerId &&
      state.splitType === value.splitType &&
      state.selected.length === value.selected.length &&
      state.selected.every((id) => value.selected.includes(id))
    )
  }

  /** The one-line description on the closed control. */
  const summary = useMemo(() => {
    const hit = shortcuts.find((option) => matches(option.state))
    if (hit) return hit.label

    const who = value.payerId === currentProfileId ? 'You' : nameOf(value.payerId)
    const how = SPLIT_LABELS[value.splitType].toLowerCase()
    return `${who} paid, split ${how} between ${value.selected.length}`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, shortcuts, members])

  function apply(state: SplitState) {
    onChange(state)
    setOpen(false)
    setAdvanced(false)
  }

  function toggleMember(id: string) {
    const selected = value.selected.includes(id)
      ? value.selected.filter((value) => value !== id)
      : [...value.selected, id]
    onChange({ ...value, selected })
  }

  const preview = useMemo(() => {
    if (totalCents === null || value.selected.length === 0) return null
    try {
      return splitExpense(
        value.splitType,
        totalCents,
        value.selected.map((id) => ({
          profileId: id,
          weight: parseWeight(value.weights[id], value.splitType, currency),
        }))
      )
    } catch {
      return null
    }
  }, [totalCents, value, currency])

  if (members.length < 2) return null

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-edge bg-raised px-4 py-3 text-left transition-colors hover:border-accent"
      >
        <span className="min-w-0">
          <span className="block text-xs text-muted">How it splits</span>
          <span className="block truncate text-base font-medium">{summary}</span>
        </span>
        <span aria-hidden className="shrink-0 text-muted">
          ›
        </span>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-edge px-4 py-4">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="w-20 text-left text-sm font-medium text-accent"
        >
          Cancel
        </button>
        <h2 className="text-base font-semibold">How should it split?</h2>
        <span className="w-20" />
      </header>

      <div className="flex-1 overflow-y-auto">
        {!advanced ? (
          <>
            <ul className="divide-y divide-edge">
              {shortcuts.map((option) => {
                const result = consequence(option.state)
                const selected = matches(option.state)

                return (
                  <li key={option.key}>
                    <button
                      type="button"
                      onClick={() => apply(option.state)}
                      className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-raised"
                    >
                      <span
                        className={`shrink-0 rounded-full ${
                          selected ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : ''
                        }`}
                      >
                        <Avatar
                          name={
                            option.state.payerId === currentProfileId
                              ? (me?.name ?? 'You')
                              : (members.find((m) => m.id === option.state.payerId)?.name ?? '?')
                          }
                          size={40}
                        />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block text-base">{option.label}</span>
                        {result && (
                          <span
                            className={`block text-sm font-medium ${
                              result.owed ? 'text-positive' : 'text-negative'
                            }`}
                          >
                            {result.text}
                          </span>
                        )}
                      </span>

                      {selected && (
                        <span aria-hidden className="shrink-0 text-lg text-accent">
                          ✓
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="p-5">
              <button
                type="button"
                onClick={() => setAdvanced(true)}
                className="w-full rounded-xl border border-edge px-4 py-3 text-sm font-semibold text-muted transition-colors hover:border-accent hover:text-accent"
              >
                More options
              </button>
              {totalCents === null && (
                <p className="mt-3 text-center text-sm text-muted">
                  Enter an amount to see what each of these comes to.
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-5 p-5">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Who paid?</span>
              <select
                value={value.payerId}
                onChange={(event) => onChange({ ...value, payerId: event.target.value })}
                className="rounded-xl border border-edge bg-raised px-4 py-3 text-base outline-none focus:border-accent"
              >
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.id === currentProfileId ? 'You' : member.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">How should it split?</span>
              <div className="grid grid-cols-3 gap-1.5">
                {SPLIT_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => onChange({ ...value, splitType: type })}
                    className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition-colors ${
                      value.splitType === type
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-edge text-muted hover:text-ink'
                    }`}
                  >
                    {SPLIT_LABELS[type]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted">{SPLIT_HINTS[value.splitType]}</p>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">
                Split between{' '}
                <span className="font-normal text-muted">
                  {value.selected.length} of {members.length}
                </span>
              </span>

              <ul className="flex flex-col gap-1.5">
                {members.map((member) => {
                  const isSelected = value.selected.includes(member.id)
                  const share = preview?.find((s) => s.profileId === member.id)

                  return (
                    <li
                      key={member.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                        isSelected ? 'border-edge bg-raised' : 'border-edge/50 opacity-50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleMember(member.id)}
                        aria-pressed={isSelected}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <Avatar name={member.name} size={32} />
                        <span className="truncate text-sm font-medium">
                          {member.id === currentProfileId ? 'You' : member.name}
                        </span>
                      </button>

                      {isSelected && value.splitType !== 'equal' && (
                        <input
                          value={value.weights[member.id] ?? ''}
                          onChange={(event) =>
                            onChange({
                              ...value,
                              weights: { ...value.weights, [member.id]: event.target.value },
                            })
                          }
                          inputMode="decimal"
                          placeholder={
                            value.splitType === 'percent'
                              ? '%'
                              : value.splitType === 'shares'
                                ? '1'
                                : '0'
                          }
                          className="amount w-20 rounded-lg border border-edge bg-surface px-2 py-1.5 text-right text-sm outline-none focus:border-accent"
                        />
                      )}

                      {isSelected && share && (
                        <span className="amount w-24 text-right text-sm font-semibold text-muted">
                          {formatCents(share.owedCents, currency)}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-edge p-4">
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setAdvanced(false)
          }}
          className="w-full rounded-xl bg-accent px-4 py-3.5 font-semibold text-white"
        >
          Done
        </button>
        <div style={{ height: 'env(safe-area-inset-bottom)' }} />
      </div>
    </div>
  )
}

/**
 * Weight inputs mean different things per split type, so they are parsed
 * differently: exact amounts and adjustments are money, percentages and shares
 * are plain numbers.
 */
export function parseWeight(
  raw: string | undefined,
  splitType: SplitType,
  currency: string
): number | undefined {
  if (splitType === 'equal') return undefined

  const value = (raw ?? '').trim()
  if (value === '') return splitType === 'shares' ? 1 : 0

  if (splitType === 'exact' || splitType === 'adjustment') {
    return parseAmountToCents(value, currency)
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
