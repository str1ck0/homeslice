/**
 * Group operations.
 *
 * Plain async functions with no framework coupling — Server Actions and Route
 * Handlers are both thin wrappers over these, so a native client can reach the
 * same logic over HTTP without any of it being reimplemented.
 */

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from './session'
import { getOverview, outstandingInGroup } from './overview'
import { deleteAvatarObject } from './avatars'

/**
 * No currency here on purpose. A group holds expenses in any number of
 * currencies — a trip through three countries is one group, not three — and
 * balances are already reported per currency. The group's own `currency`
 * column survives only as the starting suggestion for its next expense.
 */
export const createGroupSchema = z.object({
  name: z.string().trim().min(1, 'Give the group a name').max(80),
  label: z.string().trim().max(60).optional().nullable(),
  icon: z.string().trim().max(16).optional().nullable(),
  address: z.string().trim().max(200).optional().nullable(),
})

export type CreateGroupInput = z.infer<typeof createGroupSchema>

export interface GroupSummary {
  id: string
  name: string
  label: string | null
  icon: string | null
  avatarUrl: string | null
  currency: string
  inviteCode: string
  memberCount: number
}

export async function createGroup(input: CreateGroupInput): Promise<string> {
  const parsed = createGroupSchema.parse(input)
  const me = await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('create_group', {
    p_name: parsed.name,
    p_label: parsed.label ?? null,
    p_icon: parsed.icon ?? null,
    // Whatever you normally spend in, as the first suggestion only.
    p_currency: me.default_currency,
    p_address: parsed.address ?? null,
  } as never)

  if (error) throw new Error(error.message)
  return data as string
}

export const updateGroupSchema = z.object({
  name: z.string().trim().min(1, 'Give the group a name').max(80),
  label: z.string().trim().max(60).nullable().optional(),
})

export type UpdateGroupInput = z.infer<typeof updateGroupSchema>

/**
 * Rename a group, or change its label.
 *
 * Admin-only, enforced by the `groups_update` policy rather than here — a
 * non-admin's update matches no rows and is reported rather than silently
 * appearing to work.
 */
export async function updateGroup(groupId: string, input: UpdateGroupInput): Promise<void> {
  z.string().uuid().parse(groupId)
  const parsed = updateGroupSchema.parse(input)
  await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('groups')
    .update({ name: parsed.name, label: parsed.label || null })
    .eq('id', groupId)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error('Only a group admin can rename this group')
  }
}

/**
 * Set or clear a group's photo. Admin-only, like every other group edit —
 * enforced by `groups_update` rather than here.
 */
export async function setGroupAvatar(groupId: string, url: string | null): Promise<void> {
  z.string().uuid().parse(groupId)
  const parsed = url === null ? null : z.string().url().max(500).parse(url)
  await requireProfile()
  const supabase = await createClient()

  // Read the old URL before overwriting it, so the file it points at can be
  // cleaned up afterwards.
  const { data: before } = await supabase
    .from('groups')
    .select('avatar_url')
    .eq('id', groupId)
    .maybeSingle()

  const { data, error } = await supabase
    .from('groups')
    .update({ avatar_url: parsed })
    .eq('id', groupId)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error('Only a group admin can change the group photo')
  }

  const previous = before?.avatar_url ?? null
  if (previous && previous !== parsed) await deleteAvatarObject(previous)
}

/**
 * The currency to start the next expense in for this group: whatever was last
 * used here, falling back to your own default.
 *
 * This is what makes a multi-country trip bearable. Land in Portugal, add one
 * euro expense, and every expense after it starts in euros instead of snapping
 * back to the currency you happened to create the group in.
 */
export async function suggestGroupCurrency(groupId: string): Promise<string | null> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('expenses')
    .select('currency')
    .eq('group_id', groupId)
    .is('deleted_at', null)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data?.currency ?? null
}

export async function joinGroupByCode(code: string): Promise<string> {
  const trimmed = z.string().trim().min(1, 'Enter an invite code').parse(code)
  await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('join_group_by_code', { code: trimmed })
  if (error) throw new Error(error.message)
  return data as string
}

export async function listMyGroups(): Promise<GroupSummary[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('groups')
    .select('id, name, label, icon, avatar_url, currency, invite_code, group_members(count)')
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    label: group.label,
    icon: group.icon,
    avatarUrl: group.avatar_url,
    currency: group.currency,
    inviteCode: group.invite_code,
    // Supabase returns aggregate relations as [{ count: n }].
    memberCount:
      (group.group_members as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
  }))
}

export interface GroupMember {
  profileId: string
  displayName: string
  avatarUrl: string | null
  role: string
}

export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('group_members')
    .select('role, profile_id, profiles!inner(id, display_name, avatar_url)')
    .eq('group_id', groupId)
    .is('left_at', null)
    .order('joined_at')

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => {
    const profile = row.profiles as unknown as {
      id: string
      display_name: string
      avatar_url: string | null
    }
    return {
      profileId: profile.id,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
      role: row.role,
    }
  })
}

export async function getGroup(groupId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .eq('id', groupId)
    .single()

  if (error) throw new Error(error.message)
  return data
}

/**
 * Add someone you already know to a group — a friend, or somebody already in
 * another group with you. They keep their identity and their history.
 */
export async function addGroupMember(groupId: string, profileId: string): Promise<string> {
  const parsed = z
    .object({
      groupId: z.string().uuid(),
      profileId: z.string().uuid(),
    })
    .parse({ groupId, profileId })

  await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('add_group_member', {
    p_group_id: parsed.groupId,
    p_profile_id: parsed.profileId,
  } as never)

  if (error) throw new Error(error.message)
  return data as string
}

/**
 * Take someone out of a group, or leave it yourself.
 *
 * `left_at` rather than a delete: their expenses stay, the history stays
 * readable, and the balance that came from them is not silently rewritten.
 *
 * Refused while they still owe or are owed anything here. The check lives in
 * the service rather than in SQL so the money maths stays in `src/core` where
 * it is tested — this is a guard against an honest mistake, not a security
 * boundary, and RLS is what actually decides who may write the row.
 */
export async function removeGroupMember(groupId: string, profileId: string): Promise<void> {
  const parsed = z
    .object({ groupId: z.string().uuid(), profileId: z.string().uuid() })
    .parse({ groupId, profileId })

  const me = await requireProfile()
  const supabase = await createClient()

  const overview = await getOverview(me.id)
  const outstanding = outstandingInGroup(overview, parsed.profileId, parsed.groupId)
  if (outstanding.size > 0) {
    const leaving = parsed.profileId === me.id
    throw new Error(
      leaving
        ? 'Settle up in this group before you leave it'
        : 'They still have an unsettled balance in this group'
    )
  }

  // The group must not be left without an admin. Promoting the longest-standing
  // member is kinder than refusing: the alternative is a group nobody can
  // rename or delete, reachable only by leaving in the wrong order.
  const { data: members, error: membersError } = await supabase
    .from('group_members')
    .select('profile_id, role, joined_at')
    .eq('group_id', parsed.groupId)
    .is('left_at', null)
    .order('joined_at')

  if (membersError) throw new Error(membersError.message)

  const remaining = (members ?? []).filter((m) => m.profile_id !== parsed.profileId)
  const leavingIsAdmin = (members ?? []).some(
    (m) => m.profile_id === parsed.profileId && m.role === 'admin'
  )
  const anotherAdminRemains = remaining.some((m) => m.role === 'admin')

  if (leavingIsAdmin && !anotherAdminRemains && remaining.length > 0) {
    const { error: promoteError } = await supabase
      .from('group_members')
      .update({ role: 'admin' })
      .eq('group_id', parsed.groupId)
      .eq('profile_id', remaining[0].profile_id)

    if (promoteError) throw new Error(promoteError.message)
  }

  const { data, error } = await supabase
    .from('group_members')
    .update({ left_at: new Date().toISOString() })
    .eq('group_id', parsed.groupId)
    .eq('profile_id', parsed.profileId)
    .is('left_at', null)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error('Only a group admin can remove someone else')
  }
}

/** Leave a group yourself. Allowed without being an admin. */
export async function leaveGroup(groupId: string): Promise<void> {
  const me = await requireProfile()
  await removeGroupMember(groupId, me.id)
}

export interface GroupContents {
  expenseCount: number
  settlementCount: number
}

/**
 * What deleting this group would destroy.
 *
 * Every child table cascades from `groups`, so a delete takes the expenses and
 * settlements with it. The UI asks for the group's name typed out when this
 * comes back non-empty, and only then.
 */
export async function getGroupContents(groupId: string): Promise<GroupContents> {
  const supabase = await createClient()

  const [expenses, settlements] = await Promise.all([
    supabase
      .from('expenses')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .is('deleted_at', null),
    supabase
      .from('settlements')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', groupId),
  ])

  return {
    expenseCount: expenses.count ?? 0,
    settlementCount: settlements.count ?? 0,
  }
}

/**
 * Delete a group outright, along with everything in it.
 *
 * Admin-only, enforced by the `groups_delete` policy rather than here — a
 * non-admin's delete removes no rows and is reported as such rather than
 * silently claiming success.
 */
export async function deleteGroup(groupId: string): Promise<string> {
  z.string().uuid().parse(groupId)
  await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('groups')
    .delete()
    .eq('id', groupId)
    .select('id, name')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error('Only a group admin can delete this group')
  }

  // The name comes back from the deleted row so the dashboard can say which
  // group went — by the time it renders, there is nothing left to look up.
  return data[0].name
}
