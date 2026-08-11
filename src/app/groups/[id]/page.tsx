import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/services/session'
import { getGroup, getGroupMembers } from '@/server/services/groups'
import { getBalances } from '@/server/services/balances'
import { listExpenses } from '@/server/services/expenses'
import { Amount, Avatar, Card, EmptyState } from '@/components/ui'
import AddPersonButton from './AddPersonButton'
import { formatCents } from '@/core/money'

export const dynamic = 'force-dynamic'

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getCurrentProfile()
  if (!profile) redirect('/auth')

  const group = await getGroup(id).catch(() => null)
  if (!group) notFound()

  const [members, balances, expenses] = await Promise.all([
    getGroupMembers(id),
    getBalances(id, profile.id),
    listExpenses(id, profile.id),
  ])

  const nameFor = new Map(members.map((m) => [m.profileId, m.displayName]))
  const yourEntries = [...balances.yours.entries()]

  // Who you specifically owe or are owed, rather than a group total.
  const yourDebts = balances.pairwise.filter(
    (edge) => edge.fromProfileId === profile.id || edge.toProfileId === profile.id
  )

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
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            Your balance
          </h2>
          {yourEntries.length === 0 ? (
            <p className="text-sm text-muted">You&rsquo;re all square in this group.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {yourEntries.map(([currency, cents]) => (
                  <li key={currency} className="flex items-baseline justify-between gap-4">
                    <span className="text-sm text-muted">
                      {cents > 0 ? "You're owed" : 'You owe'}
                    </span>
                    <Amount cents={cents} currency={currency} className="text-2xl font-bold" />
                  </li>
                ))}
              </ul>

              {yourDebts.length > 0 && (
                <ul className="mt-4 flex flex-col gap-1.5 border-t border-edge pt-4">
                  {yourDebts.map((edge, index) => {
                    const youOwe = edge.fromProfileId === profile.id
                    const other = youOwe ? edge.toProfileId : edge.fromProfileId
                    return (
                      <li key={index} className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-muted">
                          {youOwe ? 'You owe' : `${nameFor.get(other) ?? 'Someone'} owes you`}
                          {youOwe && ` ${nameFor.get(other) ?? 'someone'}`}
                        </span>
                        <span
                          className={`amount font-semibold ${youOwe ? 'text-negative' : 'text-positive'}`}
                        >
                          {formatCents(edge.amountCents, edge.currency)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}

              <Link
                href={`/groups/${id}/settle`}
                className="mt-4 block rounded-xl border border-accent px-4 py-2.5 text-center text-sm font-semibold text-accent"
              >
                Settle up
              </Link>
            </>
          )}
        </Card>

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
              {expenses.map((expense) => {
                const yourNet = expense.yourPaidCents - expense.yourShareCents
                return (
                  <li key={expense.id}>
                    <Card className="flex items-center gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{expense.description}</p>
                        <p className="truncate text-sm text-muted">
                          {expense.paidByNames.length > 0
                            ? `${expense.paidByNames.join(' & ')} paid ${formatCents(expense.amountCents, expense.currency)}`
                            : formatCents(expense.amountCents, expense.currency)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted">
                          {yourNet === 0 ? 'not involved' : yourNet > 0 ? 'you lent' : 'you owe'}
                        </p>
                        <Amount
                          cents={yourNet}
                          currency={expense.currency}
                          className="font-semibold"
                        />
                      </div>
                    </Card>
                  </li>
                )
              })}
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

          <AddPersonButton groupId={id} />

          <Card className="mt-3 p-4">
            <p className="text-sm font-medium">Invite someone</p>
            <p className="mt-1 text-sm text-muted">Share this code:</p>
            <p className="mt-2 select-all rounded-xl bg-surface px-4 py-3 text-center text-xl font-bold tracking-[0.3em]">
              {group.invite_code}
            </p>
          </Card>
        </section>
      </main>
    </div>
  )
}
