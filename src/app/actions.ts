'use server'

/**
 * Server Actions — thin adapters over src/server/services.
 *
 * They exist only to bridge React forms to the services and to invalidate
 * caches. No business logic lives here, which is what lets the same services
 * be exposed as HTTP Route Handlers for a native client later.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import {
  createGroup,
  joinGroupByCode,
  addGroupMember,
  deleteGroup,
  updateGroup,
  removeGroupMember,
  leaveGroup,
  setGroupAvatar,
  type UpdateGroupInput,
} from '@/server/services/groups'
import { updateProfile, setAvatar, type UpdateProfileInput } from '@/server/services/profile'
import {
  createExpense,
  deleteExpense,
  updateExpense,
  type ExpenseInput,
} from '@/server/services/expenses'
import { recordSettlement, type SettlementInput } from '@/server/services/settlements'
import { addFriend, removeFriend } from '@/server/services/friends'

export interface ActionResult {
  ok: boolean
  error?: string
  data?: unknown
}

/** Turn any thrown error into something worth showing a person. */
function toResult(error: unknown): ActionResult {
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? 'That does not look right' }
  }
  if (error instanceof Error) {
    return { ok: false, error: error.message }
  }
  return { ok: false, error: 'Something went wrong' }
}

export async function createGroupAction(formData: FormData): Promise<ActionResult> {
  let groupId: string
  try {
    groupId = await createGroup({
      name: String(formData.get('name') ?? ''),
      label: String(formData.get('label') ?? '') || null,
      icon: String(formData.get('icon') ?? '') || null,
      address: String(formData.get('address') ?? '') || null,
    })
  } catch (error) {
    return toResult(error)
  }

  revalidatePath('/dashboard')
  // ?created=1 is what the group page uses to confirm it worked. Without it a
  // successful create looked identical to nothing happening, which is how you
  // end up with six groups of the same name.
  redirect(`/groups/${groupId}?created=1`)
}

export async function joinGroupAction(formData: FormData): Promise<ActionResult> {
  let groupId: string
  try {
    groupId = await joinGroupByCode(String(formData.get('code') ?? ''))
  } catch (error) {
    return toResult(error)
  }

  revalidatePath('/dashboard')
  redirect(`/groups/${groupId}`)
}


export async function addGroupMemberAction(
  groupId: string,
  profileId: string
): Promise<ActionResult> {
  try {
    await addGroupMember(groupId, profileId)
    revalidatePath(`/groups/${groupId}`)
    revalidatePath('/expenses/new')
    return { ok: true }
  } catch (error) {
    return toResult(error)
  }
}

export async function updateGroupAction(
  groupId: string,
  input: UpdateGroupInput
): Promise<ActionResult> {
  try {
    await updateGroup(groupId, input)
    revalidatePath(`/groups/${groupId}`)
    revalidatePath('/groups')
    revalidatePath('/dashboard')
    return { ok: true }
  } catch (error) {
    return toResult(error)
  }
}

export async function removeGroupMemberAction(
  groupId: string,
  profileId: string
): Promise<ActionResult> {
  try {
    await removeGroupMember(groupId, profileId)
    revalidatePath(`/groups/${groupId}`)
    return { ok: true }
  } catch (error) {
    return toResult(error)
  }
}

export async function leaveGroupAction(groupId: string): Promise<ActionResult> {
  try {
    await leaveGroup(groupId)
  } catch (error) {
    return toResult(error)
  }

  revalidatePath('/groups')
  revalidatePath('/dashboard')
  redirect('/groups?left=1')
}

export async function removeFriendAction(profileId: string): Promise<ActionResult> {
  try {
    await removeFriend(profileId)
  } catch (error) {
    return toResult(error)
  }

  revalidatePath('/friends')
  revalidatePath('/dashboard')
  redirect('/friends?removed=1')
}

export async function setAvatarAction(url: string | null): Promise<ActionResult> {
  try {
    await setAvatar(url)
    revalidatePath('/account')
    revalidatePath('/dashboard')
    revalidatePath('/friends')
    return { ok: true }
  } catch (error) {
    return toResult(error)
  }
}

export async function setGroupAvatarAction(
  groupId: string,
  url: string | null
): Promise<ActionResult> {
  try {
    await setGroupAvatar(groupId, url)
    revalidatePath(`/groups/${groupId}`)
    revalidatePath('/groups')
    return { ok: true }
  } catch (error) {
    return toResult(error)
  }
}

export async function updateProfileAction(input: UpdateProfileInput): Promise<ActionResult> {
  try {
    await updateProfile(input)
    revalidatePath('/account')
    revalidatePath('/dashboard')
    return { ok: true }
  } catch (error) {
    return toResult(error)
  }
}

export async function deleteGroupAction(groupId: string): Promise<ActionResult> {
  let name: string
  try {
    name = await deleteGroup(groupId)
  } catch (error) {
    return toResult(error)
  }

  revalidatePath('/dashboard')
  revalidatePath('/groups')
  // Back to the group list, which is where you were: it is the only place in
  // the app that links to a group page, so it is always where you came from.
  redirect(`/groups?deleted=${encodeURIComponent(name)}`)
}

export async function createExpenseAction(input: ExpenseInput): Promise<ActionResult> {
  try {
    const expenseId = await createExpense(input)
    revalidatePath('/dashboard')
    if (input.groupId) revalidatePath(`/groups/${input.groupId}`)
    return { ok: true, data: expenseId }
  } catch (error) {
    return toResult(error)
  }
}

export async function updateExpenseAction(
  expenseId: string,
  input: ExpenseInput
): Promise<ActionResult> {
  try {
    await updateExpense(expenseId, input)
    revalidatePath('/dashboard')
    revalidatePath(`/expenses/${expenseId}`)
    if (input.groupId) revalidatePath(`/groups/${input.groupId}`)
    return { ok: true, data: expenseId }
  } catch (error) {
    return toResult(error)
  }
}

export async function deleteExpenseAction(
  expenseId: string,
  groupId: string | null
): Promise<ActionResult> {
  try {
    await deleteExpense(expenseId)
    revalidatePath('/dashboard')
    if (groupId) revalidatePath(`/groups/${groupId}`)
    return { ok: true }
  } catch (error) {
    return toResult(error)
  }
}

export async function recordSettlementAction(input: SettlementInput): Promise<ActionResult> {
  try {
    const id = await recordSettlement(input)
    revalidatePath('/dashboard')
    if (input.groupId) revalidatePath(`/groups/${input.groupId}`)
    return { ok: true, data: id }
  } catch (error) {
    return toResult(error)
  }
}

export async function addFriendAction(name: string): Promise<ActionResult> {
  try {
    const profileId = await addFriend(name)
    revalidatePath('/friends')
    revalidatePath('/expenses/new')
    return { ok: true, data: profileId }
  } catch (error) {
    return toResult(error)
  }
}

