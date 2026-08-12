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
  isPlaceholder: boolean
}

export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('group_members')
    .select('role, profile_id, profiles!inner(id, display_name, avatar_url, auth_user_id)')
    .eq('group_id', groupId)
    .is('left_at', null)
    .order('joined_at')

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => {
    const profile = row.profiles as unknown as {
      id: string
      display_name: string
      avatar_url: string | null
      auth_user_id: string | null
    }
    return {
      profileId: profile.id,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
      role: row.role,
      isPlaceholder: profile.auth_user_id === null,
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
 * Add someone you already know to a group — a friend, or a placeholder you
 * created elsewhere. They keep their identity and their history, which is the
 * whole point of not making a fresh placeholder every time.
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

/** Add someone who has not signed up. They can be split with immediately. */
export async function addPlaceholderMember(
  groupId: string | null,
  displayName: string,
  email?: string
): Promise<string> {
  const parsed = z
    .object({
      displayName: z.string().trim().min(1, 'Enter a name').max(80),
      email: z.string().trim().email('That does not look like an email').optional().or(z.literal('')),
    })
    .parse({ displayName, email: email ?? '' })

  await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('add_placeholder_member', {
    p_group_id: groupId,
    p_display_name: parsed.displayName,
    p_email: parsed.email || null,
  } as never)

  if (error) throw new Error(error.message)
  return data as string
}
