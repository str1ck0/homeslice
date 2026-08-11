'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createExpenseAction } from '@/app/actions'
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
  groupId,
  groups,
  members,
  defaultCurrency,
  categories,
}: {
  currentProfileId: string
  groupId: string | null
  groups: { id: string; name: string; currency: string }[]
  members: Member[]
  defaultCurrency: string
  categories: { id: string; name: string }[]
}) {
  const router = useRouter()

  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(defaultCurrency)
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [categoryId, setCategoryId] = useState('')
  const [payerId, setPayerId] = useState(currentProfileId)
  const [splitType, setSplitType] = useState<SplitType>('equal')
  const [selected, setSelected] = useState<string[]>(members.map((m) => m.id))
  const [weights, setWeights] = useState<Record<string, string>>({})
  const [images, setImages] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
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

  function toggleMember(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    )
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
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

      const result = await createExpenseAction({
        groupId,
        description,
        amount,
        currency,
        expenseDate,
        splitType,
        categoryId: categoryId || null,
        note: null,
        payers: [{ profileId: payerId, amountCents: totalCents }],
        participants: participants.map((m) => ({
          profileId: m.id,
          weight: parseWeight(weights[m.id], splitType, currency),
        })),
        imagePaths,
      })

      if (!result.ok) {
        setError(result.error ?? 'Could not save the expense')
        return
      }

      router.push(groupId ? `/groups/${groupId}` : '/dashboard')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the expense')
    } finally {
      setBusy(false)
      setUploadStatus(null)
    }
  }

  const needsWeights = splitType !== 'equal'

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-5 py-8 pb-32"
    >
      <div className="flex items-center justify-between">
        <Link
          href={groupId ? `/groups/${groupId}` : '/dashboard'}
          className="text-sm text-muted hover:text-ink"
        >
          ← Cancel
        </Link>
        <h1 className="text-lg font-semibold">New expense</h1>
        <span className="w-14" />
      </div>

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
          value={payerId}
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
            disabled={busy || Boolean(preview?.error) || participants.length === 0}
            className="w-full rounded-xl bg-accent px-4 py-3.5 font-semibold text-white disabled:opacity-40"
          >
            {busy ? (uploadStatus ?? 'Saving…') : 'Save expense'}
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
