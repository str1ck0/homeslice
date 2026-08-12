import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/services/session'
import { listMyGroups } from '@/server/services/groups'
import { debtLinesInGroup, getOverview, sumLines } from '@/server/services/overview'
import {
  Avatar,
  Card,
  CurrencyTotals,
  DebtBreakdown,
  EmptyState,
  PageShell,
} from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string; left?: string }>
}) {
  const { deleted, left } = await searchParams
  const profile = await getCurrentProfile()
  if (!profile) redirect('/auth')

  const [groups, overview] = await Promise.all([listMyGroups(), getOverview(profile.id)])

  // Expenses that belong to no group still have to live somewhere, or they are
  // invisible from here. Splitwise solves this with a pseudo-group row and it
  // is the right answer: it is where people look for them.
  const nonGroupLines = debtLinesInGroup(overview, profile.id, null)
  const nonGroupTotals = sumLines(nonGroupLines)

  const owed = [...overview.overall.values()].some((cents) => cents > 0)

  return (
    <PageShell
      title="Groups"
      subtitle={overview.overall.size === 0 ? "You're all square" : undefined}
      nav="groups"
      action={
        <Link
          href="/groups/new"
          className="rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white"
        >
          New
        </Link>
      }
    >
      {(deleted || left) && (
        <p
          role="status"
          className="mb-5 rounded-xl bg-positive/10 px-4 py-3 text-sm font-medium text-positive"
        >
          {left ? 'You left the group.' : deleted === '1' ? 'Group deleted.' : `“${deleted}” deleted.`}
        </p>
      )}

      {overview.overall.size > 0 && (
        <p className="mb-5 text-lg font-semibold text-balance">
          Overall, {owed ? "you're owed" : 'you owe'}{' '}
          <CurrencyTotals totals={overview.overall} />
        </p>
      )}

      {groups.length === 0 && nonGroupTotals.size === 0 ? (
        <Card>
          <EmptyState
            title="No groups yet"
            body="A group keeps a house, a trip or a flat in one place. You don't need one to split with a friend."
            action={
              <Link
                href="/groups/new"
                className="mt-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white"
              >
                Create a group
              </Link>
            }
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map((group) => {
            const lines = debtLinesInGroup(overview, profile.id, group.id)
            const totals = sumLines(lines)
            return (
              <li key={group.id}>
                <Link
                  href={`/groups/${group.id}`}
                  className="block rounded-2xl border border-edge bg-raised p-4 transition-colors hover:border-accent/50"
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={group.name} url={group.avatarUrl} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{group.name}</p>
                      <p className="truncate text-sm text-muted">
                        {group.label ? `${group.label} · ` : ''}
                        {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
                      </p>
                    </div>
                    <div className="text-right">
                      {totals.size === 0 ? (
                        <span className="text-sm text-muted">settled up</span>
                      ) : (
                        <>
                          <p className="text-xs text-muted">
                            {[...totals.values()][0] > 0 ? "you're owed" : 'you owe'}
                          </p>
                          <CurrencyTotals totals={totals} className="amount font-semibold" />
                        </>
                      )}
                    </div>
                  </div>
                  {lines.length > 0 && <DebtBreakdown lines={lines} className="mt-3" />}
                </Link>
              </li>
            )
          })}

          {nonGroupTotals.size > 0 && (
            <li>
              <Link
                href="/friends"
                className="block rounded-2xl border border-edge bg-raised p-4 transition-colors hover:border-accent/50"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent/15 text-lg">
                    &#8942;
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">Non-group expenses</p>
                    <p className="truncate text-sm text-muted">Splits with no group</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted">
                      {[...nonGroupTotals.values()][0] > 0 ? "you're owed" : 'you owe'}
                    </p>
                    <CurrencyTotals totals={nonGroupTotals} className="amount font-semibold" />
                  </div>
                </div>
                <DebtBreakdown lines={nonGroupLines} className="mt-3" />
              </Link>
            </li>
          )}
        </ul>
      )}
    </PageShell>
  )
}
