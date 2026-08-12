import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/services/session'
import { listFriends } from '@/server/services/friends'
import { listExpensesWithPerson } from '@/server/services/expenses'
import { debtLinesWith, getOverview, totalWith } from '@/server/services/overview'
import { Avatar, Card, CurrencyTotals, DebtBreakdown, EmptyState, ExpenseRow } from '@/components/ui'
import RemoveFriendButton from './RemoveFriendButton'

export const dynamic = 'force-dynamic'

export default async function FriendPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getCurrentProfile()
  if (!profile) redirect('/auth')

  const friends = await listFriends()
  const friend = friends.find((f) => f.profileId === id)
  if (!friend) notFound()

  const [overview, expenses] = await Promise.all([
    getOverview(profile.id),
    listExpensesWithPerson(profile.id, friend.profileId),
  ])

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
          {friend.username && <p className="text-sm text-muted">@{friend.username}</p>}
          {friend.isPlaceholder && (
            <p className="text-sm text-muted">Hasn&rsquo;t signed up yet</p>
          )}
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
            className="mt-4 block rounded-xl border border-accent px-4 py-2.5 text-center text-sm font-semibold text-accent"
          >
            Settle up
          </Link>
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
            Shared expenses
          </h2>
          <Link href="/expenses/new" className="text-sm font-medium text-accent">
            Add expense
          </Link>
        </div>

        {expenses.length === 0 ? (
          <Card>
            <EmptyState
              title="Nothing shared yet"
              body={`Anything you split with ${friend.displayName} shows up here — in a group or not.`}
            />
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {expenses.map((expense) => (
              <li key={expense.id}>
                <ExpenseRow expense={expense} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <RemoveFriendButton profileId={friend.profileId} displayName={friend.displayName} />
    </div>
  )
}
