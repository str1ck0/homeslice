import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/services/session'
import { getGroup, getGroupMembers, listMyGroups } from '@/server/services/groups'
import { createClient } from '@/lib/supabase/server'
import ExpenseForm from './ExpenseForm'

export const dynamic = 'force-dynamic'

export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>
}) {
  const { group: groupId } = await searchParams
  const profile = await getCurrentProfile()
  if (!profile) redirect('/auth')

  const supabase = await createClient()
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')
    .order('name')

  const [groups, members, group] = await Promise.all([
    listMyGroups(),
    groupId ? getGroupMembers(groupId) : Promise.resolve([]),
    groupId ? getGroup(groupId).catch(() => null) : Promise.resolve(null),
  ])

  return (
    <ExpenseForm
      currentProfileId={profile.id}
      groupId={groupId ?? null}
      groups={groups.map((g) => ({ id: g.id, name: g.name, currency: g.currency }))}
      members={
        members.length > 0
          ? members.map((m) => ({ id: m.profileId, name: m.displayName }))
          : [{ id: profile.id, name: profile.display_name }]
      }
      defaultCurrency={group?.currency ?? profile.default_currency}
      categories={categories ?? []}
    />
  )
}
