'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createExpenseAction, updateExpenseAction } from '@/app/actions'
import { SPLIT_TYPES, splitExpense, type SplitType } from '@/core/split'
import { formatCents, parseAmountToCents } from '@/core/money'
import { CURRENCY_CODES } from '@/core/currencies'
import { Avatar } from '@/components/ui'
import ImagePicker from '@/components/ImagePicker'
import { uploadReceipts } from '@/lib/upload'

interface Member {
  id: string
  name: string
}

export interface EditingExpense {
  expenseId: string
  description: string
  /** Already formatted for the input, e.g. "300.00". */
  amount: string
  currency: string
  expenseDate: string
  splitType: SplitType
  categoryId: string
  payerId: string
  participantIds: string[]
  /** Keyed by profile id, in the form the matching split type expects. */
  weights: Record<string, string>
  /**
   * The form offers one payer. An expense with several can only arrive via the
   * API, and silently flattening it would quietly change what people owe.
   */
  multiplePayers: boolean
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
  percent: 'Type each share as a percentage. Must add up to 100%.',
  shares: 'Give people weights — 2 shares pays twice what 1 share pays.',
  adjustment: 'Add or subtract a fixed amount, then split the rest equally.',
}

export default function ExpenseForm({
  currentProfileId,
  currentProfileName,
  initialGroupId,
  groups,
  groupMembers,
  friends,
  defaultCurrency,
  categories,
  editing,
}: {
  currentProfileId: string
  currentProfileName: string
  initialGroupId: string | null
  groups: { id: string; name: string; currency: string }[]
  groupMembers: Member[]
  friends: Member[]
  defaultCurrency: string
  categories: { id: string; name: string }[]
  editing?: EditingExpense
}) {
  const router = useRouter()
  const [groupId, setGroupId] = useState<string | null>(initialGroupId)

  /**
   * Who can be split with. Inside a group that is its members; outside one it
   * is your friends. Either way you are always in the list, because an expense
   * you are not part of is not one you would be adding.
   */
  const members: Member[] = useMemo(() => {
    const base = groupId ? groupMembers : friends
    const withMe = base.some((m) => m.id === currentProfileId)
      ? base
      : [{ id: currentProfileId, name: currentProfileName }, ...base]
    return withMe
  }, [groupId, groupMembers, friends, currentProfileId, currentProfileName])

  const [description, setDescription] = useState(editing?.description ?? '')
  const [amount, setAmount] = useState(editing?.amount ?? '')
  const [currency, setCurrency] = useState(editing?.currency ?? defaultCurrency)
  // Once you have picked a currency by hand, switching group leaves it alone.
  const [touchedCurrency, setTouchedCurrency] = useState(false)
  const [expenseDate, setExpenseDate] = useState(
    () => editing?.expenseDate ?? new Date().toISOString().slice(0, 10)
  )
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '')
  const [payerId, setPayerId] = useState(editing?.payerId ?? currentProfileId)
  const [splitType, setSplitType] = useState<SplitType>(editing?.splitType ?? 'equal')
  const [selected, setSelected] = useState<string[]>(
    editing?.participantIds ?? members.map((m) => m.id)
  )
  // In edit mode the existing selection is the truth, so never overwrite it.
  const [touchedSelection, setTouchedSelection] = useState(Boolean(editing))
  const [weights, setWeights] = useState<Record<string, string>>(editing?.weights ?? {})
  const [images, setImages] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const participants = members.filter((m) => selected.includes(m.id))

  /**
   * Live preview of the split, computed with the same functions the server
   * uses. If it cannot balance, the reason is shown rather than the Save
   * button silently failing.
   */
  const preview = useMemo(() => {
    if (!amount.trim() || participants.length === 0) return null
    try {
      const totalCents = parseAmountToCents(amount, currency)
      const shares = splitExpense(
        splitType,
        totalCents,
        participants.map((m) => ({
          profileId: m.id,
          weight: parseWeight(weights[m.id], splitType, currency),
        }))
      )
      return { shares, error: null as string | null }
    } catch (err) {
      return { shares: null, error: err instanceof Error ? err.message : 'Check the split' }
    }
  }, [amount, currency, splitType, participants, weights])

  // Switching group swaps the whole cast, so default everyone back on unless
  // the user has deliberately picked a subset.
  useEffect(() => {
    if (!touchedSelection) setSelected(members.map((m) => m.id))
  }, [members, touchedSelection])

  function toggleMember(id: string) {
    setTouchedSelection(true)
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    )
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    // A ref, because setBusy is asynchronous: a second submit fired before
    // React re-renders reads the stale value and saves the expense twice.
    if (submitting.current) return
    submitting.current = true

    setBusy(true)
    setError(null)

    try {
      const totalCents = parseAmountToCents(amount, currency)

      // Upload first: an expense saved without its receipt is harder to fix
      // than one that failed outright and can simply be retried.
      let imagePaths: string[] = []
      if (images.length > 0) {
        setUploadStatus(`Uploading ${images.length} photo${images.length === 1 ? '' : 's'}…`)
        imagePaths = await uploadReceipts(images)
        setUploadStatus(null)
      }

      const payload = {
        groupId,
        description,
        amount,
        currency,
        expenseDate,
        splitType,
        categoryId: categoryId || null,
        note: null,
        payers: [{ profileId: effectivePayerId, amountCents: totalCents }],
        participants: participants.map((m) => ({
          profileId: m.id,
          weight: parseWeight(weights[m.id], splitType, currency),
        })),
        imagePaths,
      }

      const result = editing
        ? await updateExpenseAction(editing.expenseId, payload)
        : await createExpenseAction(payload)

      if (!result.ok) {
        setError(result.error ?? 'Could not save the expense')
        setBusy(false)
        submitting.current = false
        return
      }

      // Deliberately still busy: the navigation below has only been asked for,
      // not finished, and a button that comes back to life in the meantime is
      // an invitation to save the same expense again.
      router.push(editing ? `/expenses/${editing.expenseId}` : groupId ? `/groups/${groupId}` : '/dashboard')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the expense')
      setBusy(false)
      submitting.current = false
    } finally {
      setUploadStatus(null)
    }
  }

  // The chosen payer may not exist in the new cast after switching group.
  const effectivePayerId = members.some((m) => m.id === payerId) ? payerId : currentProfileId

  const needsWeights = splitType !== 'equal'

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-5 py-8 pb-32"
    >
      <div className="flex items-center justify-between">
        <Link
          href={
            editing
              ? `/expenses/${editing.expenseId}`
              : groupId
                ? `/groups/${groupId}`
                : '/dashboard'
          }
          className="text-sm text-muted hover:text-ink"
        >
          ← Cancel
        </Link>
        <h1 className="text-lg font-semibold">{editing ? 'Edit expense' : 'New expense'}</h1>
        <span className="w-14" />
      </div>

      {editing?.multiplePayers && (
        <p className="rounded-xl bg-negative/10 px-4 py-3 text-sm text-negative">
          This expense was paid by more than one person. The form only handles a single
          payer, so saving would change who paid what — edit it via the API, or delete and
          re-add it.
        </p>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Where does this belong?</span>
        <select
          disabled={Boolean(editing)}
          value={groupId ?? ''}
          onChange={(event) => {
            setGroupId(event.target.value || null)
            setTouchedSelection(false)
            // Suggest the group's usual currency, but never overrule a currency
            // the user has already picked — on a trip through three countries
            // that snapping back is the whole problem.
            const next = groups.find((g) => g.id === event.target.value)
            if (next && !touchedCurrency) setCurrency(next.currency)
          }}
          className="rounded-xl border border-edge bg-raised px-4 py-3 text-base outline-none focus:border-accent disabled:opacity-60"
        >
          <option value="">Just friends — no group</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">What was it?</span>
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          required
          maxLength={140}
          placeholder="Groceries"
          className="rounded-xl border border-edge bg-raised px-4 py-3 text-base outline-none focus:border-accent"
        />
      </label>

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
            onChange={(event) => {
              setTouchedCurrency(true)
              setCurrency(event.target.value)
            }}
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

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Date</span>
          <input
            type="date"
            value={expenseDate}
            onChange={(event) => setExpenseDate(event.target.value)}
            className="rounded-xl border border-edge bg-raised px-4 py-3 text-base outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Category</span>
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="rounded-xl border border-edge bg-raised px-4 py-3 text-base outline-none focus:border-accent"
          >
            <option value="">None</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Who paid?</span>
        <select
          value={effectivePayerId}
          onChange={(event) => setPayerId(event.target.value)}
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
              onClick={() => setSplitType(type)}
              className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition-colors ${
                splitType === type
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-edge text-muted hover:text-ink'
              }`}
            >
              {SPLIT_LABELS[type]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">{SPLIT_HINTS[splitType]}</p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          Split between{' '}
          <span className="font-normal text-muted">
            {participants.length} of {members.length}
          </span>
        </span>

        {members.length === 1 && (
          <div className="rounded-xl border border-dashed border-edge p-4 text-sm text-muted">
            <p className="font-medium text-ink">There&rsquo;s nobody to split with yet.</p>
            <p className="mt-1">
              {groupId
                ? 'Add someone to this group first.'
                : 'Add a friend, or pick a group above.'}
            </p>
            <Link
              href={groupId ? `/groups/${groupId}` : '/friends'}
              className="mt-3 inline-block rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white"
            >
              {groupId ? 'Add someone to the group' : 'Add a friend'}
            </Link>
          </div>
        )}
        <ul className="flex flex-col gap-1.5">
          {members.map((member) => {
            const isSelected = selected.includes(member.id)
            const share = preview?.shares?.find((s) => s.profileId === member.id)

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

                {isSelected && needsWeights && (
                  <input
                    value={weights[member.id] ?? ''}
                    onChange={(event) =>
                      setWeights((current) => ({ ...current, [member.id]: event.target.value }))
                    }
                    inputMode="decimal"
                    placeholder={splitType === 'percent' ? '%' : splitType === 'shares' ? '1' : '0'}
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

      <ImagePicker files={images} onChange={setImages} />

      {(preview?.error || error) && (
        <p role="alert" className="rounded-xl bg-negative/10 px-4 py-3 text-sm text-negative">
          {error ?? preview?.error}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-edge bg-raised/95 p-4 backdrop-blur">
        <div className="mx-auto max-w-lg">
          <button
            type="submit"
            disabled={
              busy ||
              Boolean(preview?.error) ||
              participants.length === 0 ||
              Boolean(editing?.multiplePayers)
            }
            className="w-full rounded-xl bg-accent px-4 py-3.5 font-semibold text-white disabled:opacity-40"
          >
            {busy ? (uploadStatus ?? 'Saving…') : editing ? 'Save changes' : 'Save expense'}
          </button>
        </div>
        <div style={{ height: 'env(safe-area-inset-bottom)' }} />
      </div>
    </form>
  )
}

/**
 * Weight inputs mean different things per split type, so they are parsed
 * differently: exact amounts and adjustments are money, percentages and shares
 * are plain numbers.
 */
function parseWeight(
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
