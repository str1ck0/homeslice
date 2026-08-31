'use client'

import { useMemo, useState } from 'react'
import { Card, EmptyState, ExpenseRow, SettlementRow } from '@/components/ui'
import { currencySymbol } from '@/core/money'
import { matches } from '@/core/search'

/**
 * A ledger you can search.
 *
 * Filtering happens here, in the browser, over rows the page has already
 * fetched — not as a query parameter and a round trip. Both pages that use
 * this already load every entry to compute balances, so the data is sitting in
 * memory either way, and typing that repaints instantly beats typing that
 * waits on Postgres.
 *
 * The honest limit: this is linear over everything you can see. At the
 * hundreds it is instant; at the tens of thousands it would need to move to
 * the database, and the shape of the thing to write is a `.textSearch()` in
 * listExpensesWithPerson rather than a rewrite of this file.
 *
 * Note what is deliberately *not* rendered here: relative times. ExpenseRow
 * takes an `activity` prop that says "3 hours ago", and in a client component
 * that string would be computed once on the server and again on hydration,
 * against a clock that has moved. The dashboard renders those rows on the
 * server for exactly that reason; this list shows dates, which do not drift.
 */

export interface LedgerEntry {
  kind: 'expense' | 'settlement'
  id: string
  /** ISO date the entry is filed under — expense_date or settled_on. */
  date: string
  groupName: string | null
  deleted: boolean
  currency: string
  /** Haystack from `searchable()`, built on the server so it is not rebuilt per keystroke. */
  search: string
  categoryName: string | null
  expense?: React.ComponentProps<typeof ExpenseRow>['expense']
  settlement?: React.ComponentProps<typeof SettlementRow>['settlement']
}

type Kind = 'all' | 'expense' | 'settlement'

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-edge text-muted hover:border-accent/50'
      }`}
    >
      {children}
    </button>
  )
}

export default function LedgerList({
  entries,
  currentProfileId,
  emptyTitle,
  emptyBody,
  emptyAction,
}: {
  entries: LedgerEntry[]
  currentProfileId: string
  emptyTitle: string
  emptyBody: string
  /** Rendered inside the empty state. Server components may pass JSX here. */
  emptyAction?: React.ReactNode
}) {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<Kind>('all')
  const [currency, setCurrency] = useState<string>('all')
  const [category, setCategory] = useState<string>('all')
  const [showDeleted, setShowDeleted] = useState(false)

  // Only offer a filter that would actually divide this list. A currency chip
  // on a list with one currency, or a category dropdown on a list with none,
  // is a control that can only ever be a no-op.
  const currencies = useMemo(
    () => [...new Set(entries.map((e) => e.currency))].sort(),
    [entries]
  )
  const categories = useMemo(
    () =>
      [...new Set(entries.map((e) => e.categoryName).filter((c): c is string => Boolean(c)))].sort(),
    [entries]
  )
  const deletedCount = useMemo(() => entries.filter((e) => e.deleted).length, [entries])

  const visible = useMemo(() => {
    return entries.filter((entry) => {
      // Deleted entries are out of the way by default: they change nothing and
      // would otherwise pad every search with things that no longer count.
      if (entry.deleted && !showDeleted) return false
      if (kind !== 'all' && entry.kind !== kind) return false
      if (currency !== 'all' && entry.currency !== currency) return false
      if (category !== 'all' && entry.categoryName !== category) return false
      return matches(entry.search, query)
    })
  }, [entries, query, kind, currency, category, showDeleted])

  const filtering =
    query !== '' || kind !== 'all' || currency !== 'all' || category !== 'all'

  function clearAll() {
    setQuery('')
    setKind('all')
    setCurrency('all')
    setCategory('all')
  }

  if (entries.length === 0) {
    return (
      <Card>
        <EmptyState title={emptyTitle} body={emptyBody} action={emptyAction} />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search"
        aria-label="Search expenses and payments"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="h-14 rounded-xl border border-edge bg-raised px-4 text-base outline-none focus:border-accent"
      />

      {/* Horizontally scrollable so a long row of categories cannot widen the
          page — the one thing a mobile layout must never do. */}
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        <Chip active={kind === 'all'} onClick={() => setKind('all')}>
          All
        </Chip>
        <Chip active={kind === 'expense'} onClick={() => setKind('expense')}>
          Expenses
        </Chip>
        <Chip active={kind === 'settlement'} onClick={() => setKind('settlement')}>
          Payments
        </Chip>

        {currencies.length > 1 && (
          <>
            <span className="w-px shrink-0 self-stretch bg-edge" aria-hidden />
            {currencies.map((code) => (
              <Chip
                key={code}
                active={currency === code}
                onClick={() => setCurrency(currency === code ? 'all' : code)}
              >
                {currencySymbol(code)}
              </Chip>
            ))}
          </>
        )}

        {categories.length > 1 && (
          <>
            <span className="w-px shrink-0 self-stretch bg-edge" aria-hidden />
            {categories.map((name) => (
              <Chip
                key={name}
                active={category === name}
                onClick={() => setCategory(category === name ? 'all' : name)}
              >
                {name}
              </Chip>
            ))}
          </>
        )}
      </div>

      {(filtering || deletedCount > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          {filtering && (
            <>
              <span>
                {visible.length} of {entries.length - (showDeleted ? 0 : deletedCount)}
              </span>
              <button
                type="button"
                onClick={clearAll}
                className="font-medium text-accent hover:underline"
              >
                Clear
              </button>
            </>
          )}
          {deletedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowDeleted((shown) => !shown)}
              className="font-medium text-accent hover:underline"
            >
              {showDeleted ? 'Hide' : 'Show'} {deletedCount} deleted
            </button>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <Card className="p-5">
          <p className="text-sm text-muted">
            Nothing matches. <button
              type="button"
              onClick={clearAll}
              className="font-medium text-accent hover:underline"
            >
              Clear the filters
            </button>{' '}
            to see everything again.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((entry) =>
            entry.kind === 'expense' && entry.expense ? (
              <li key={`e-${entry.id}`}>
                <ExpenseRow
                  expense={entry.expense}
                  groupName={entry.groupName}
                  deleted={entry.deleted}
                />
              </li>
            ) : entry.settlement ? (
              <li key={`s-${entry.id}`}>
                <SettlementRow
                  settlement={entry.settlement}
                  currentProfileId={currentProfileId}
                  groupName={entry.groupName}
                  deleted={entry.deleted}
                />
              </li>
            ) : null
          )}
        </ul>
      )}
    </div>
  )
}
