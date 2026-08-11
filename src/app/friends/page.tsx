import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentProfile } from '@/server/services/session'
import { listFriends } from '@/server/services/friends'
import { getOverallBalance } from '@/server/services/balances'
import { createClient } from '@/lib/supabase/server'
import { calculateNetBalances, calculatePairwiseDebts } from '@/core/balances'
import { Avatar, Card, EmptyState, PageShell } from '@/components/ui'
import { formatCents } from '@/core/money'
import AddFriendButton from './AddFriendButton'

export const dynamic = 'force-dynamic'

export default async function FriendsPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/auth')

  const supabase = await createClient()
  const [friends, { data: expenseRows }, { data: settlementRows }] = await Promise.all([
    listFriends(),
    supabase
      .from('expenses')
      .select('id, currency, expense_participants(profile_id, paid_cents, owed_cents)')
      .is('deleted_at', null),
    supabase
      .from('settlements')
      .select('id, currency, from_profile, to_profile, amount_cents')
      .is('deleted_at', null),
  ])

  // Per-person totals across everything, so a friend row shows what you
  // actually owe them rather than only a group figure.
  const edges = calculatePairwiseDebts(
    (expenseRows ?? []).map((row) => ({
      id: row.id,
      currency: row.currency,
      participants: (row.expense_participants ?? []).map((p) => ({
        profileId: p.profile_id,
        paidCents: p.paid_cents,
        owedCents: p.owed_cents,
      })),
    })),
    (settlementRows ?? []).map((row) => ({
      id: row.id,
      currency: row.currency,
      fromProfileId: row.from_profile,
      toProfileId: row.to_profile,
      amountCents: row.amount_cents,
    }))
  )

  return (
    <PageShell
      title="Friends"
      subtitle="Split with anyone — no group needed"
      nav="friends"
      action={<AddFriendButton compact />}
    >
      {friends.length === 0 ? (
        <Card>
          <EmptyState
            title="No friends yet"
            body="Add someone by their username, or by email. If they're not on Homeslice you can still split with them — they'll pick up the history when they sign up."
            action={<AddFriendButton />}
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {friends.map((friend) => {
            const between = edges.filter(
              (edge) =>
                (edge.fromProfileId === profile.id && edge.toProfileId === friend.profileId) ||
                (edge.fromProfileId === friend.profileId && edge.toProfileId === profile.id)
            )

            return (
              <li key={friend.profileId}>
                <Card className="flex items-center gap-3 p-4">
                  <Avatar name={friend.displayName} url={friend.avatarUrl} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{friend.displayName}</p>
                    <p className="truncate text-sm text-muted">
                      {friend.isPlaceholder
                        ? "Hasn't signed up yet"
                        : friend.username
                          ? `@${friend.username}`
                          : friend.email}
                    </p>
                  </div>
                  <div className="text-right">
                    {between.length === 0 ? (
                      <span className="text-sm text-muted">square</span>
                    ) : (
                      between.map((edge, index) => {
                        const youOwe = edge.fromProfileId === profile.id
                        return (
                          <div key={index}>
                            <p className="text-xs text-muted">
                              {youOwe ? 'you owe' : 'owes you'}
                            </p>
                            <p
                              className={`amount font-semibold ${
                                youOwe ? 'text-negative' : 'text-positive'
                              }`}
                            >
                              {formatCents(edge.amountCents, edge.currency)}
                            </p>
                          </div>
                        )
                      })
                    )}
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {friends.length > 0 && (
        <Link
          href="/expenses/new"
          className="mt-4 block rounded-xl bg-accent px-4 py-3.5 text-center font-semibold text-white"
        >
          Split something
        </Link>
      )}
    </PageShell>
  )
}
