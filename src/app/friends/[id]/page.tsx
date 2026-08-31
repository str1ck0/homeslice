import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/services/session'
import { listFriends } from '@/server/services/friends'
import { listExpensesWithPerson } from '@/server/services/expenses'
import { listSettlementsWithPerson } from '@/server/services/settlements'
import { debtLinesWith, getOverview, totalWith } from '@/server/services/overview'
import { Avatar, Card, CurrencyTotals, DebtBreakdown } from '@/components/ui'
import LedgerList, { type LedgerEntry } from '@/components/LedgerList'
import { searchable } from '@/core/search'
import RemoveFriendButton from './RemoveFriendButton'

export const dynamic = 'force-dynamic'

export default async function FriendPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getCurrentProfile()
  if (!profile) redirect('/auth')

  const friends = await listFriends()
  const friend = friends.find((f) => f.profileId === id)
  if (!friend) notFound()

  const [overview, expenses, settlements] = await Promise.all([
    getOverview(profile.id),
    listExpensesWithPerson(profile.id, friend.profileId, { includeDeleted: true }),
    listSettlementsWithPerson(profile.id, friend.profileId, { includeDeleted: true }),
  ])

  // Group name for anything that came from one. This list mixes group and
  // one-off entries — an expense you shared inside a house still sits between
  // the two of you — and without the label a group expense reads as a private
  // one, which is a different thing entirely.
  const groupNameFor = (groupId: string | null) =>
    groupId ? (overview.groupNames.get(groupId) ?? 'a group') : null

  // One ledger, not two. A payment and an expense both change what you owe, so
  // hiding one of them is how a balance ends up with no visible cause.
  //
  // The search haystack is assembled here rather than in the browser: it is the
  // same string on every keystroke, so building it once on the server beats
  // rebuilding it per character, and it keeps the matching rules in one place.
  const entries: LedgerEntry[] = [
    ...expenses.map((expense) => ({
      kind: 'expense' as const,
      id: expense.id,
      date: expense.expenseDate,
      groupName: groupNameFor(expense.groupId),
      deleted: expense.deletedAt !== null,
      currency: expense.currency,
      categoryName: expense.categoryName,
      search: searchable(
        expense.description,
        ...expense.paidByNames,
        expense.categoryName,
        groupNameFor(expense.groupId)
      ),
      expense,
    })),
    ...settlements.map((settlement) => ({
      kind: 'settlement' as const,
      id: settlement.id,
      date: settlement.settledOn,
      groupName: groupNameFor(settlement.groupId),
      deleted: settlement.deletedAt !== null,
      currency: settlement.currency,
      categoryName: null,
      search: searchable(
        'payment',
        settlement.fromName,
        settlement.toName,
        settlement.method,
        groupNameFor(settlement.groupId)
      ),
      settlement,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  const totals = totalWith(overview, profile.id, friend.profileId)
  const lines = debtLinesWith(overview, profile.id, friend.profileId)
  const owed = [...totals.values()].some((cents) => cents > 0)

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-5 py-8 pb-16">
      <Link href="/friends" className="text-sm text-muted hover:text-ink">
        ← Friends
      </Link>

      <div className="flex items-center gap-3">
        <Avatar name={friend.displayName} url={friend.avatarUrl} size={56} />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">{friend.displayName}</h1>
        </div>
      </div>

      {totals.size === 0 ? (
        <Card className="p-5">
          <p className="text-sm text-muted">
            You&rsquo;re all square with {friend.displayName}.
          </p>
        </Card>
      ) : (
        <div>
          <p className="text-lg font-semibold text-balance">
            {owed ? "You're owed" : 'You owe'} <CurrencyTotals totals={totals} />
          </p>
          {lines.length > 1 && <DebtBreakdown lines={lines} className="mt-3" />}
          <Link
            href={`/friends/${friend.profileId}/settle`}
            className="mt-4 block rounded-xl border border-accent px-4 py-3 text-center text-sm font-semibold text-accent"
          >
            Settle up
          </Link>
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="min-w-0 text-sm font-semibold uppercase tracking-wider text-muted">
            Expenses &amp; payments
          </h2>
          <Link href="/expenses/new" className="shrink-0 text-sm font-medium text-accent">
            Add expense
          </Link>
        </div>

        <LedgerList
          entries={entries}
          currentProfileId={profile.id}
          emptyTitle="Nothing shared yet"
          emptyBody={`Anything you split or settle with ${friend.displayName} shows up here — in a group or not.`}
        />
      </section>

      <RemoveFriendButton profileId={friend.profileId} displayName={friend.displayName} />
    </div>
  )
}
