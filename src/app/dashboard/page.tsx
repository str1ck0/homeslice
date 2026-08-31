import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/services/session'
import { getOverview } from '@/server/services/overview'
import { listFriends } from '@/server/services/friends'
import { listMyGroups } from '@/server/services/groups'
import { listRecentActivity } from '@/server/services/activity'
import { BalanceSummary, Card, EmptyState, PageShell } from '@/components/ui'
import LedgerList, { type LedgerEntry } from '@/components/LedgerList'
import { searchable } from '@/core/search'

// Balances change on every expense, so this page is always rendered fresh.
export const dynamic = 'force-dynamic'

/** Shown at once, before "Show N older". */
const RECENT_SHOWN = 30

/**
 * How far back the search reaches. Not unbounded: every entry is serialised
 * into the page, so this is the one number trading payload size against how
 * much of your history the home screen can find. At roughly two expenses a day
 * it is a couple of years, and the friend and group pages have no limit at all.
 */
const ACTIVITY_LIMIT = 1000

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
    //
    // Far more than the thirty shown, because the search box below covers
    // everything it is given: a search that only looked at the visible rows
    // would say "nothing matches" about an expense sitting two screens down.
    // The service already reads every row to sort them, so asking for more
    // costs one larger payload and no extra query.
    listRecentActivity(profile.id, ACTIVITY_LIMIT),
  ])

  const owed = [...overview.overall.values()].some((cents) => cents > 0)
  const isNew = groups.length === 0 && friends.length === 0

  // One instant for the whole page, so "3 hours ago" says the same thing in the
  // server render and in the hydrated one.
  const now = new Date().toISOString()

  const entries: LedgerEntry[] = activity.map((entry) =>
    entry.kind === 'expense'
      ? {
          kind: 'expense' as const,
          id: entry.id,
          date: entry.expense.expenseDate,
          groupName: entry.groupName,
          deleted: entry.deleted,
          currency: entry.expense.currency,
          categoryName: entry.expense.categoryName,
          activity: entry.stamp,
          search: searchable(
            entry.expense.description,
            ...entry.expense.paidByNames,
            entry.expense.categoryName,
            entry.groupName,
            entry.stamp.actorName
          ),
          expense: entry.expense,
        }
      : {
          kind: 'settlement' as const,
          id: entry.id,
          date: entry.settlement.settledOn,
          groupName: entry.groupName,
          deleted: entry.deleted,
          currency: entry.settlement.currency,
          categoryName: null,
          activity: entry.stamp,
          search: searchable(
            'payment',
            entry.settlement.fromName,
            entry.settlement.toName,
            entry.settlement.method,
            entry.groupName,
            entry.stamp.actorName
          ),
          settlement: entry.settlement,
        }
  )

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
          <LedgerList
            entries={entries}
            currentProfileId={profile.id}
            now={now}
            initialLimit={RECENT_SHOWN}
            emptyTitle="Nothing yet"
            emptyBody="Anything you or anyone you split with adds, edits or deletes shows up here."
          />
        </section>
      )}
    </PageShell>
  )
}
