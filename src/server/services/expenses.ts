/**
 * Expense operations.
 *
 * Split maths happens here on the server, using the unit-tested functions in
 * src/core. The client sends what the user typed — amounts, percentages,
 * shares — and never the computed per-person figures, so a stale tab or a
 * poked-at request cannot write a split that does not add up.
 */

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from './session'
import { SPLIT_TYPES, splitExpense, type SplitType } from '@/core/split'
import { parseAmountToCents } from '@/core/money'

const participantSchema = z.object({
  profileId: z.string().uuid(),
  /** Percentage, share count, exact cents, or adjustment — depends on splitType. */
  weight: z.number().optional(),
})

const payerSchema = z.object({
  profileId: z.string().uuid(),
  amountCents: z.number().int().nonnegative(),
})

export const expenseInputSchema = z.object({
  groupId: z.string().uuid().nullable(),
  description: z.string().trim().min(1, 'Give the expense a description').max(140),
  /** Raw user input, e.g. "1 234,56". Parsed server-side. */
  amount: z.string().trim().min(1, 'Enter an amount'),
  currency: z.string().length(3),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  splitType: z.enum(SPLIT_TYPES),
  categoryId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  /** Who actually put money in. Usually one person, but any number is allowed. */
  payers: z.array(payerSchema).min(1, 'Say who paid'),
  participants: z.array(participantSchema).min(1, 'Choose who to split with'),
  imagePaths: z.array(z.string()).optional(),
})

export type ExpenseInput = z.infer<typeof expenseInputSchema>

export class ExpenseValidationError extends Error {}

/**
 * Turn user input into the exact per-person rows the database expects.
 * Exported so the create form can preview the split without saving.
 */
export function buildParticipantRows(input: ExpenseInput) {
  const amountCents = parseAmountToCents(input.amount, input.currency)

  const paidTotal = input.payers.reduce((sum, p) => sum + p.amountCents, 0)
  if (paidTotal !== amountCents) {
    const difference = amountCents - paidTotal
    throw new ExpenseValidationError(
      difference > 0
        ? `The payments are short by ${difference} cents`
        : `The payments exceed the total by ${Math.abs(difference)} cents`
    )
  }

  const shares = splitExpense(
    input.splitType as SplitType,
    amountCents,
    input.participants.map((p) => ({ profileId: p.profileId, weight: p.weight }))
  )

  const paidByProfile = new Map(input.payers.map((p) => [p.profileId, p.amountCents]))

  // Anyone who paid but is not sharing the expense still needs a row, or their
  // payment would vanish and the expense would not balance.
  const profileIds = new Set([
    ...shares.map((s) => s.profileId),
    ...paidByProfile.keys(),
  ])

  const owedByProfile = new Map(shares.map((s) => [s.profileId, s.owedCents]))
  const weightByProfile = new Map(shares.map((s) => [s.profileId, s.splitWeight]))

  return {
    amountCents,
    rows: [...profileIds].map((profileId) => ({
      profile_id: profileId,
      paid_cents: paidByProfile.get(profileId) ?? 0,
      owed_cents: owedByProfile.get(profileId) ?? 0,
      split_weight: weightByProfile.get(profileId) ?? null,
    })),
  }
}

export async function createExpense(input: ExpenseInput): Promise<string> {
  const parsed = expenseInputSchema.parse(input)
  await requireProfile()

  const { amountCents, rows } = buildParticipantRows(parsed)
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('create_expense', {
    p_group_id: parsed.groupId,
    p_description: parsed.description,
    p_amount_cents: amountCents,
    p_currency: parsed.currency,
    p_expense_date: parsed.expenseDate,
    p_split_type: parsed.splitType,
    p_category_id: parsed.categoryId ?? null,
    p_note: parsed.note ?? null,
    p_participants: rows,
  } as never)

  if (error) throw new Error(error.message)
  const expenseId = data as string

  if (parsed.imagePaths?.length) {
    const { error: imageError } = await supabase.from('expense_images').insert(
      parsed.imagePaths.map((storagePath, index) => ({
        expense_id: expenseId,
        storage_path: storagePath,
        sort_order: index,
      }))
    )
    // A failed image link should not discard a valid expense.
    if (imageError) console.error('Failed to attach images:', imageError.message)
  }

  return expenseId
}

export async function updateExpense(expenseId: string, input: ExpenseInput): Promise<string> {
  const parsed = expenseInputSchema.parse(input)
  await requireProfile()

  const { amountCents, rows } = buildParticipantRows(parsed)
  const supabase = await createClient()

  const { error } = await supabase.rpc('update_expense', {
    p_expense_id: expenseId,
    p_description: parsed.description,
    p_amount_cents: amountCents,
    p_currency: parsed.currency,
    p_expense_date: parsed.expenseDate,
    p_split_type: parsed.splitType,
    p_category_id: parsed.categoryId ?? null,
    p_note: parsed.note ?? null,
    p_participants: rows,
  } as never)

  if (error) throw new Error(error.message)
  return expenseId
}

/** Soft delete, so it can be restored and still shows in the activity feed. */
export async function deleteExpense(expenseId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()

  const { error } = await supabase
    .from('expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', expenseId)

  if (error) throw new Error(error.message)
}

export interface ExpenseListItem {
  id: string
  description: string
  amountCents: number
  currency: string
  expenseDate: string
  categoryName: string | null
  paidByNames: string[]
  yourShareCents: number
  yourPaidCents: number
  imageCount: number
}

export async function listExpenses(
  groupId: string | null,
  profileId: string
): Promise<ExpenseListItem[]> {
  const supabase = await createClient()

  let query = supabase
    .from('expenses')
    .select(
      `id, description, amount_cents, currency, expense_date,
       categories(name),
       expense_participants(profile_id, paid_cents, owed_cents, profiles(display_name)),
       expense_images(count)`
    )
    .is('deleted_at', null)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })

  query = groupId ? query.eq('group_id', groupId) : query.is('group_id', null)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return (data ?? []).map((expense) => {
    const participants = (expense.expense_participants ?? []) as unknown as {
      profile_id: string
      paid_cents: number
      owed_cents: number
      profiles: { display_name: string } | null
    }[]

    const mine = participants.find((p) => p.profile_id === profileId)

    return {
      id: expense.id,
      description: expense.description,
      amountCents: expense.amount_cents,
      currency: expense.currency,
      expenseDate: expense.expense_date,
      categoryName: (expense.categories as unknown as { name: string } | null)?.name ?? null,
      paidByNames: participants
        .filter((p) => p.paid_cents > 0)
        .map((p) => p.profiles?.display_name ?? 'Someone'),
      yourShareCents: mine?.owed_cents ?? 0,
      yourPaidCents: mine?.paid_cents ?? 0,
      imageCount:
        (expense.expense_images as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
    }
  })
}
