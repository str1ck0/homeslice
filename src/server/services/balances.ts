/**
 * Reading balances.
 *
 * Fetches the raw records and hands them to the pure functions in src/core,
 * which do all the arithmetic. Nothing here decides what anybody owes — that
 * lives in tested code with no database attached.
 */

import { createClient } from '@/lib/supabase/server'
import {
  type DebtEdge,
  type ExpenseRecord,
  type SettlementRecord,
  balanceForProfile,
  calculateNetBalances,
  calculatePairwiseDebts,
} from '@/core/balances'
import { simplifyDebts } from '@/core/simplify'
import type { Cents } from '@/core/money'

async function fetchRecords(groupId: string | null) {
  const supabase = await createClient()

  let expenseQuery = supabase
    .from('expenses')
    .select('id, currency, expense_participants(profile_id, paid_cents, owed_cents)')
    .is('deleted_at', null)

  let settlementQuery = supabase
    .from('settlements')
    .select('id, currency, from_profile, to_profile, amount_cents')
    .is('deleted_at', null)

  if (groupId) {
    expenseQuery = expenseQuery.eq('group_id', groupId)
    settlementQuery = settlementQuery.eq('group_id', groupId)
  }

  const [{ data: expenseRows, error: expenseError }, { data: settlementRows, error: settlementError }] =
    await Promise.all([expenseQuery, settlementQuery])

  if (expenseError) throw new Error(expenseError.message)
  if (settlementError) throw new Error(settlementError.message)

  const expenses: ExpenseRecord[] = (expenseRows ?? []).map((row) => ({
    id: row.id,
    currency: row.currency,
    participants: (row.expense_participants ?? []).map((p) => ({
      profileId: p.profile_id,
      paidCents: p.paid_cents,
      owedCents: p.owed_cents,
    })),
  }))

  const settlements: SettlementRecord[] = (settlementRows ?? []).map((row) => ({
    id: row.id,
    currency: row.currency,
    fromProfileId: row.from_profile,
    toProfileId: row.to_profile,
    amountCents: row.amount_cents,
  }))

  return { expenses, settlements }
}

export interface GroupBalances {
  /** Everyone's net position, per currency. Positive means they are owed. */
  net: Map<string, Map<string, Cents>>
  /** Directed debts between specific people. */
  pairwise: DebtEdge[]
  /** The minimal set of payments that would settle everyone up. */
  simplified: DebtEdge[]
  /** The signed-in user's own position, per currency. */
  yours: Map<string, Cents>
}

export async function getBalances(
  groupId: string | null,
  profileId: string
): Promise<GroupBalances> {
  const { expenses, settlements } = await fetchRecords(groupId)

  const net = calculateNetBalances(expenses, settlements)

  return {
    net,
    pairwise: calculatePairwiseDebts(expenses, settlements),
    simplified: simplifyDebts(net),
    yours: balanceForProfile(net, profileId),
  }
}

/** Your overall position across every group and every one-off expense. */
export async function getOverallBalance(profileId: string): Promise<Map<string, Cents>> {
  const supabase = await createClient()

  // RLS already limits these to expenses the user can see, so no group filter
  // is needed — "everything visible to me" is exactly "everything of mine".
  const [{ data: expenseRows }, { data: settlementRows }] = await Promise.all([
    supabase
      .from('expenses')
      .select('id, currency, expense_participants(profile_id, paid_cents, owed_cents)')
      .is('deleted_at', null),
    supabase
      .from('settlements')
      .select('id, currency, from_profile, to_profile, amount_cents')
      .is('deleted_at', null),
  ])

  const expenses: ExpenseRecord[] = (expenseRows ?? []).map((row) => ({
    id: row.id,
    currency: row.currency,
    participants: (row.expense_participants ?? []).map((p) => ({
      profileId: p.profile_id,
      paidCents: p.paid_cents,
      owedCents: p.owed_cents,
    })),
  }))

  const settlements: SettlementRecord[] = (settlementRows ?? []).map((row) => ({
    id: row.id,
    currency: row.currency,
    fromProfileId: row.from_profile,
    toProfileId: row.to_profile,
    amountCents: row.amount_cents,
  }))

  return balanceForProfile(calculateNetBalances(expenses, settlements), profileId)
}
