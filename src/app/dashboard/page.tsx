import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/services/session'
import { getOverview } from '@/server/services/overview'
import { listFriends } from '@/server/services/friends'
import { listMyGroups } from '@/server/services/groups'
import { listRecentActivity } from '@/server/services/activity'
import {
  BalanceSummary,
  Card,
  EmptyState,
  ExpenseRow,
  PageShell,
  SettlementRow,
} from '@/components/ui'

// Balances change on every expense, so this page is always rendered fresh.
export const dynamic = 'force-dynamic'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>
}) {
  const { welcome } = await searchParams
  const profile = await getCurrentProfile()
  if (!profile) redirect('/auth')

  const [overview, groups, friends, activity] = await Promise.all([
    getOverview(profile.id),
    listMyGroups(),
    listFriends(),
    // Ordered by when somebody last touched it, not by the date written on it.
    // A backdated expense is still news; sorting by expense_date buried it
    // below everything else while the balance it moved stayed on screen.
    listRecentActivity(profile.id, 30),
  ])

  const owed = [...overview.overall.values()].some((cents) => cents > 0)
  const isNew = groups.length === 0 && friends.length === 0

  return (
    <PageShell
      title={`Hi ${profile.display_name.split(' ')[0]}`}
      nav="home"
      action={
        <Link
          href="/expenses/new"
          className="rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white"
        >
          Add expense
        </Link>
      }
    >
      {welcome && (
        <p
          role="status"
          className="mb-6 rounded-xl bg-positive/10 px-4 py-3 text-sm font-medium text-positive"
        >
          Signed in. Welcome back, {profile.display_name}.
        </p>
      )}

      {overview.overall.size === 0 ? (
        <Card className="mb-6 p-5">
          <p className="text-sm text-muted">
            {isNew
              ? 'Add a friend or create a group, then split something.'
              : "You're all square. Nothing outstanding."}
          </p>
        </Card>
      ) : (
        <Link
          href="/friends"
          className="mb-6 block rounded-2xl border border-edge bg-raised p-5 transition-colors hover:border-accent/50"
        >
          <BalanceSummary totals={overview.overall} size="lg" />
          <p className="mt-3 text-sm text-accent">See who &rarr;</p>
        </Link>
      )}

      {isNew ? (
        <Card>
          <EmptyState
            title="Nothing here yet"
            body="Split with a friend without any setup, or make a group for a house, a flat or a trip."
            action={
              <div className="mt-2 flex gap-2">
                <Link
                  href="/friends"
                  className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Add a friend
                </Link>
                <Link
                  href="/groups/new"
                  className="rounded-xl border border-edge px-5 py-2.5 text-sm font-semibold"
                >
                  New group
                </Link>
              </div>
            }
          />
        </Card>
      ) : (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            Recent activity
          </h2>
          {activity.length === 0 ? (
            <Card className="p-5">
              <p className="text-sm text-muted">No expenses yet.</p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-2">
              {activity.map((entry) =>
                entry.kind === 'expense' ? (
                  <li key={`e-${entry.id}`}>
                    <ExpenseRow
                      expense={entry.expense}
                      groupName={entry.groupName}
                      activity={entry.stamp}
                      deleted={entry.deleted}
                    />
                  </li>
                ) : (
                  <li key={`s-${entry.id}`}>
                    <SettlementRow
                      settlement={entry.settlement}
                      currentProfileId={profile.id}
                      groupName={entry.groupName}
                      activity={entry.stamp}
                      deleted={entry.deleted}
                    />
                  </li>
                )
              )}
            </ul>
          )}
        </section>
      )}
    </PageShell>
  )
}
