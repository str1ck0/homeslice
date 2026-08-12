import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentProfile } from '@/server/services/session'
import { listFriends } from '@/server/services/friends'
import { debtLinesWith, getOverview, totalWith } from '@/server/services/overview'
import {
  Avatar,
  Card,
  CurrencyTotals,
  DebtBreakdown,
  EmptyState,
  PageShell,
} from '@/components/ui'
import AddFriendButton from './AddFriendButton'

export const dynamic = 'force-dynamic'

export default async function FriendsPage({
  searchParams,
}: {
  searchParams: Promise<{ removed?: string }>
}) {
  const { removed } = await searchParams
  const profile = await getCurrentProfile()
  if (!profile) redirect('/auth')

  const [friends, overview] = await Promise.all([listFriends(), getOverview(profile.id)])

  const rows = friends.map((friend) => ({
    friend,
    lines: debtLinesWith(overview, profile.id, friend.profileId),
    totals: totalWith(overview, profile.id, friend.profileId),
  }))

  // Outstanding first — a settled-up friend is not why you opened this.
  rows.sort((a, b) => {
    const aOpen = a.totals.size > 0 ? 0 : 1
    const bOpen = b.totals.size > 0 ? 0 : 1
    return aOpen - bOpen || a.friend.displayName.localeCompare(b.friend.displayName)
  })

  const owed = [...overview.overall.values()].some((cents) => cents > 0)

  return (
    <PageShell
      title="Friends"
      subtitle={overview.overall.size === 0 ? "You're all square" : undefined}
      nav="friends"
      action={<AddFriendButton compact />}
    >
      {removed && (
        <p
          role="status"
          className="mb-5 rounded-xl bg-positive/10 px-4 py-3 text-sm font-medium text-positive"
        >
          Friend removed.
        </p>
      )}

      {overview.overall.size > 0 && (
        <p className="mb-5 text-lg font-semibold text-balance">
          Overall, {owed ? "you're owed" : 'you owe'}{' '}
          <CurrencyTotals totals={overview.overall} />
        </p>
      )}

      {friends.length === 0 ? (
        <Card>
          <EmptyState
            title="No friends yet"
            body="Add someone by the name they go by on Homeslice. They'll need an account of their own — send them the app first if they haven't got one."
            action={<AddFriendButton />}
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(({ friend, lines, totals }) => (
            <li key={friend.profileId}>
              <Link
                href={`/friends/${friend.profileId}`}
                className="block rounded-2xl border border-edge bg-raised p-4 transition-colors hover:border-accent/50"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={friend.displayName} url={friend.avatarUrl} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{friend.displayName}</p>
                  </div>
                  <div className="text-right">
                    {totals.size === 0 ? (
                      <span className="text-sm text-muted">settled up</span>
                    ) : (
                      <>
                        <p className="text-xs text-muted">
                          {[...totals.values()][0] > 0 ? 'owes you' : 'you owe'}
                        </p>
                        <CurrencyTotals totals={totals} className="amount font-semibold" />
                      </>
                    )}
                  </div>
                </div>

                {/* Only worth breaking down when there is more than one source. */}
                {lines.length > 1 && <DebtBreakdown lines={lines} className="mt-3" />}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {friends.length > 0 && (
        <Link
          href="/expenses/new"
          className="mt-4 block rounded-xl bg-accent px-4 py-3.5 text-center font-semibold text-white"
        >
          Add expense
        </Link>
      )}
    </PageShell>
  )
}
