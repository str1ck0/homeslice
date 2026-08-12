import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/services/session'
import { getGroup, getGroupContents, getGroupMembers } from '@/server/services/groups'
import { listFriends } from '@/server/services/friends'
import { debtLinesInGroup, getOverview, sumLines } from '@/server/services/overview'
import { listExpenses } from '@/server/services/expenses'
import { Avatar, Card, CurrencyTotals, DebtBreakdown, EmptyState, ExpenseRow } from '@/components/ui'
import AddMemberButton from './AddMemberButton'
import DeleteGroupButton from './DeleteGroupButton'

export const dynamic = 'force-dynamic'

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ created?: string }>
}) {
  const { id } = await params
  const { created } = await searchParams
  const profile = await getCurrentProfile()
  if (!profile) redirect('/auth')

  const group = await getGroup(id).catch(() => null)
  if (!group) notFound()

  const [members, overview, expenses, friends, contents] = await Promise.all([
    getGroupMembers(id),
    getOverview(profile.id),
    listExpenses(id, profile.id),
    listFriends(),
    getGroupContents(id),
  ])

  const memberIds = new Set(members.map((member) => member.profileId))
  const addableFriends = friends
    .filter((friend) => !memberIds.has(friend.profileId))
    .map((friend) => ({
      profileId: friend.profileId,
      displayName: friend.displayName,
      username: friend.username,
      isPlaceholder: friend.isPlaceholder,
    }))

  const isAdmin = members.some(
    (member) => member.profileId === profile.id && member.role === 'admin'
  )

  // Scoped to this group, so a debt from elsewhere never leaks in here.
  const lines = debtLinesInGroup(overview, profile.id, id)
  const totals = sumLines(lines)
  const owed = [...totals.values()].some((cents) => cents > 0)

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col pb-28">
      <header className="px-5 pb-4 pt-8">
        <Link href="/dashboard" className="text-sm text-muted hover:text-ink">
          ← Groups
        </Link>
        <div className="mt-4 flex items-center gap-3">
          <Avatar name={group.name} url={group.avatar_url} size={52} />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight">{group.name}</h1>
            <p className="text-sm text-muted">
              {group.label ? `${group.label} · ` : ''}
              {members.length} {members.length === 1 ? 'member' : 'members'}
            </p>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 px-5">
        {created && (
          <p
            role="status"
            className="rounded-xl bg-positive/10 px-4 py-3 text-sm font-medium text-positive"
          >
            Group created. Add an expense or invite people below.
          </p>
        )}

        {totals.size === 0 ? (
          <Card className="p-5">
            <p className="text-sm text-muted">You&rsquo;re all square in this group.</p>
          </Card>
        ) : (
          <div>
            <p className="text-lg font-semibold text-balance">
              In this group, {owed ? "you're owed" : 'you owe'}{' '}
              <CurrencyTotals totals={totals} />
            </p>
            <DebtBreakdown lines={lines} className="mt-3" />
            <Link
              href={`/groups/${id}/settle`}
              className="mt-4 block rounded-xl border border-accent px-4 py-2.5 text-center text-sm font-semibold text-accent"
            >
              Settle up
            </Link>
          </div>
        )}

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Expenses</h2>
            <Link
              href={`/expenses/new?group=${id}`}
              className="text-sm font-medium text-accent"
            >
              Add expense
            </Link>
          </div>

          {expenses.length === 0 ? (
            <Card>
              <EmptyState
                title="No expenses yet"
                body="Add the first one and everyone's balance updates straight away."
                action={
                  <Link
                    href={`/expenses/new?group=${id}`}
                    className="mt-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white"
                  >
                    Add an expense
                  </Link>
                }
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

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            Members
          </h2>
          <Card className="divide-y divide-edge">
            {members.map((member) => (
              <div key={member.profileId} className="flex items-center gap-3 p-4">
                <Avatar name={member.displayName} url={member.avatarUrl} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {member.displayName}
                    {member.profileId === profile.id && (
                      <span className="ml-1.5 text-muted">(you)</span>
                    )}
                  </p>
                  {member.isPlaceholder && (
                    <p className="text-xs text-muted">Hasn&rsquo;t signed up yet</p>
                  )}
                </div>
                {member.role === 'admin' && (
                  <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                    Admin
                  </span>
                )}
              </div>
            ))}
          </Card>

          <AddMemberButton groupId={id} friends={addableFriends} />

          <Card className="mt-3 p-4">
            <p className="text-sm font-medium">Invite someone</p>
            <p className="mt-1 text-sm text-muted">Share this code:</p>
            <p className="mt-2 select-all rounded-xl bg-surface px-4 py-3 text-center text-xl font-bold tracking-[0.3em]">
              {group.invite_code}
            </p>
          </Card>
        </section>

        {isAdmin && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
              Group settings
            </h2>
            <DeleteGroupButton
              groupId={id}
              groupName={group.name}
              expenseCount={contents.expenseCount}
              settlementCount={contents.settlementCount}
            />
          </section>
        )}
      </main>
    </div>
  )
}
