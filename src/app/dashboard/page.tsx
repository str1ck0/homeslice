import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/services/session'
import { getOverallBalance } from '@/server/services/balances'
import { listMyGroups } from '@/server/services/groups'
import { Amount, Avatar, Card, EmptyState, PageShell } from '@/components/ui'
import { formatCents } from '@/core/money'

// Balances change on every expense, so this page is always rendered fresh.
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/auth')

  const [balances, groups] = await Promise.all([
    getOverallBalance(profile.id),
    listMyGroups(),
  ])

  const entries = [...balances.entries()]

  return (
    <PageShell
      title={`Hi ${profile.display_name.split(' ')[0]}`}
      subtitle={entries.length === 0 ? "You're all square" : 'Your overall position'}
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
      <Card className="mb-6 p-5">
        {entries.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing outstanding. Add an expense and balances will appear here.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map(([currency, cents]) => (
              <li key={currency} className="flex items-baseline justify-between gap-4">
                <span className="text-sm text-muted">
                  {cents > 0 ? "You're owed" : 'You owe'}
                  {entries.length > 1 && ` · ${currency}`}
                </span>
                <Amount cents={cents} currency={currency} className="text-2xl font-bold" />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Groups</h2>
        <Link href="/groups/new" className="text-sm font-medium text-accent">
          New group
        </Link>
      </div>

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            title="No groups yet"
            body="Groups are optional — you can split with a friend without one. But a house, a trip or a flat is easier to track together."
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
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                href={`/groups/${group.id}`}
                className="flex items-center gap-3 rounded-2xl border border-edge bg-raised p-4 transition-colors hover:border-accent/50"
              >
                <Avatar name={group.name} url={group.avatarUrl} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{group.name}</p>
                  <p className="truncate text-sm text-muted">
                    {group.label ? `${group.label} · ` : ''}
                    {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  )
}
