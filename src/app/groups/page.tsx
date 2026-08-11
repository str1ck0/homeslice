import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/services/session'
import { listMyGroups } from '@/server/services/groups'
import { Avatar, Card, EmptyState, PageShell } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function GroupsPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/auth')

  const groups = await listMyGroups()

  return (
    <PageShell
      title="Groups"
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
      {groups.length === 0 ? (
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
