import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/services/session'
import {
  getGroup,
  getGroupMembers,
  listMyGroups,
  suggestGroupCurrency,
} from '@/server/services/groups'
import { listFriends } from '@/server/services/friends'
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

  const [categoriesResult, groups, friends, members, group, recentCurrency] = await Promise.all([
    supabase.from('categories').select('id, name').order('name'),
    listMyGroups(),
    listFriends(),
    groupId ? getGroupMembers(groupId) : Promise.resolve([]),
    groupId ? getGroup(groupId).catch(() => null) : Promise.resolve(null),
    groupId ? suggestGroupCurrency(groupId).catch(() => null) : Promise.resolve(null),
  ])

  // What the group last spent in beats what it happened to be created in.
  const defaultCurrency = recentCurrency ?? group?.currency ?? profile.default_currency

  return (
    <ExpenseForm
      currentProfileId={profile.id}
      currentProfileName={profile.display_name}
      initialGroupId={groupId ?? null}
      groups={groups.map((g) => ({ id: g.id, name: g.name, currency: g.currency }))}
      groupMembers={members.map((m) => ({ id: m.profileId, name: m.displayName }))}
      friends={friends.map((f) => ({ id: f.profileId, name: f.displayName }))}
      defaultCurrency={defaultCurrency}
      categories={categoriesResult.data ?? []}
    />
  )
}
