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
import { createGroup, joinGroupByCode, addPlaceholderMember } from '@/server/services/groups'
import { createExpense, deleteExpense, type ExpenseInput } from '@/server/services/expenses'
import { recordSettlement, type SettlementInput } from '@/server/services/settlements'
import { addFriend, setUsername } from '@/server/services/friends'

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
      currency: String(formData.get('currency') ?? 'ZAR'),
      address: String(formData.get('address') ?? '') || null,
    })
  } catch (error) {
    return toResult(error)
  }

  revalidatePath('/dashboard')
  redirect(`/groups/${groupId}`)
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

export async function addPlaceholderAction(
  groupId: string | null,
  displayName: string,
  email?: string
): Promise<ActionResult> {
  try {
    const profileId = await addPlaceholderMember(groupId, displayName, email)
    if (groupId) revalidatePath(`/groups/${groupId}`)
    return { ok: true, data: profileId }
  } catch (error) {
    return toResult(error)
  }
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

export async function addFriendAction(
  identifier: string,
  displayName?: string
): Promise<ActionResult> {
  try {
    const profileId = await addFriend(identifier, displayName)
    revalidatePath('/friends')
    revalidatePath('/expenses/new')
    return { ok: true, data: profileId }
  } catch (error) {
    return toResult(error)
  }
}

export async function setUsernameAction(username: string): Promise<ActionResult> {
  try {
    const saved = await setUsername(username)
    revalidatePath('/account')
    return { ok: true, data: saved }
  } catch (error) {
    return toResult(error)
  }
}
