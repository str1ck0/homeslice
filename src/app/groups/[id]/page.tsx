import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/services/session'
import { getGroup, getGroupContents, getGroupMembers } from '@/server/services/groups'
import { listFriends } from '@/server/services/friends'
import { debtLinesInGroup, getOverview, sumLines } from '@/server/services/overview'
import { listExpenses } from '@/server/services/expenses'
import { Avatar, BalanceSummary, Card, DebtBreakdown, EmptyState, ExpenseRow } from '@/components/ui'
import AvatarPicker from '@/components/AvatarPicker'
import { setGroupAvatarAction } from '@/app/actions'
import AddMemberButton from './AddMemberButton'
import DeleteGroupButton from './DeleteGroupButton'
import MemberList from './MemberList'
import RenameGroupButton from './RenameGroupButton'

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
      avatarUrl: friend.avatarUrl,
    }))

  const isAdmin = members.some(
    (member) => member.profileId === profile.id && member.role === 'admin'
  )

  // Scoped to this group, so a debt from elsewhere never leaks in here.
  const lines = debtLinesInGroup(overview, profile.id, id)
  const totals = sumLines(lines)

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
            <BalanceSummary totals={totals} />
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
          <MemberList
            groupId={id}
            members={members}
            currentProfileId={profile.id}
            isAdmin={isAdmin}
          />

          <AddMemberButton
            groupId={id}
            friends={addableFriends}
            inviteCode={group.invite_code}
          />

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
            <div className="mb-3 rounded-2xl border border-edge p-4">
              <AvatarPicker
                name={group.name}
                url={group.avatar_url}
                size={56}
                // Bound rather than wrapped in a closure: the group id is
                // applied on the server, so the client never chooses it.
                onSave={setGroupAvatarAction.bind(null, id)}
              />
            </div>
            <RenameGroupButton
              groupId={id}
              currentName={group.name}
              currentLabel={group.label}
            />
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
