import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentProfile } from '@/server/services/session'
import { listFriendRequests, listFriends, type Friend } from '@/server/services/friends'
import { debtLinesWith, getOverview, totalWith } from '@/server/services/overview'
import {
  Avatar,
  Card,
  BalanceSummary,
  DebtBreakdown,
  PersonBalance,
  EmptyState,
  PageShell,
} from '@/components/ui'
import AddFriendButton from './AddFriendButton'
import FriendRequestButtons from './FriendRequestButtons'

export const dynamic = 'force-dynamic'

export default async function FriendsPage({
  searchParams,
}: {
  searchParams: Promise<{ removed?: string }>
}) {
  const { removed } = await searchParams
  const profile = await getCurrentProfile()
  if (!profile) redirect('/auth')

  const [friends, requests, overview] = await Promise.all([
    listFriends(),
    listFriendRequests(),
    getOverview(profile.id),
  ])

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

      {/* Above everything else: it is the one thing on this page waiting on you. */}
      {requests.incoming.length > 0 && (
        <RequestList
          title="Friend requests"
          people={requests.incoming}
          note="wants to split with you"
          direction="incoming"
          className="mb-6"
        />
      )}

      {overview.overall.size > 0 && <BalanceSummary totals={overview.overall} className="mb-5" />}

      {friends.length === 0 ? (
        <Card>
          <EmptyState
            title="No friends yet"
            body="Add someone by the name they go by on Homeslice. They'll need an account of their own, and to accept your request before you can split with them."
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
                  <div className="shrink-0 text-right">
                    {totals.size === 0 ? (
                      <span className="text-sm text-muted">settled up</span>
                    ) : (
                      <PersonBalance totals={totals} />
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
          className="mt-4 block rounded-xl bg-accent px-4 py-3.5 text-center font-semibold text-on-accent"
        >
          Add expense
        </Link>
      )}

      {requests.outgoing.length > 0 && (
        <RequestList
          title="Waiting to accept"
          people={requests.outgoing}
          note="request sent"
          direction="outgoing"
          className="mt-8"
        />
      )}
    </PageShell>
  )
}

function RequestList({
  title,
  people,
  note,
  direction,
  className = '',
}: {
  title: string
  people: Friend[]
  note: string
  direction: 'incoming' | 'outgoing'
  className?: string
}) {
  return (
    <section className={className}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">{title}</h2>
      <ul className="flex flex-col gap-2">
        {people.map((person) => (
          <li
            key={person.profileId}
            className={`flex items-center gap-3 rounded-2xl border bg-raised p-4 ${
              direction === 'incoming' ? 'border-accent/50' : 'border-edge'
            }`}
          >
            <Avatar name={person.displayName} url={person.avatarUrl} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{person.displayName}</p>
              <p className="text-sm text-muted">{note}</p>
            </div>
            <FriendRequestButtons profileId={person.profileId} direction={direction} />
          </li>
        ))}
      </ul>
    </section>
  )
}
