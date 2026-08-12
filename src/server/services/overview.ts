/**
 * One load of everything you can see, reduced to the numbers the screens need.
 *
 * Friends, groups and the dashboard all answer the same question from
 * different angles — "who owes whom, and where did it come from" — so they
 * share a single fetch and a single pass through the tested core.
 */

import { createClient } from '@/lib/supabase/server'
import {
  type ScopedDebtEdge,
  calculateScopedPairwiseDebts,
  netBetween,
  scopedDebtsBetween,
} from '@/core/balances'
import type { Cents } from '@/core/money'

export interface DebtLine {
  /** Null for a one-off split with no group. */
  groupId: string | null
  groupName: string | null
  currency: string
  /** Positive means you are owed; negative means you owe. */
  amountCents: Cents
  otherProfileId: string
  otherName: string
}

export interface Overview {
  edges: ScopedDebtEdge[]
  groupNames: Map<string, string>
  profileNames: Map<string, string>
  /** Your total per currency, summed across everyone and every group. */
  overall: Map<string, Cents>
}

export async function getOverview(profileId: string): Promise<Overview> {
  const supabase = await createClient()

  const [{ data: expenseRows }, { data: settlementRows }, { data: groupRows }] =
    await Promise.all([
      supabase
        .from('expenses')
        .select('id, group_id, currency, expense_participants(profile_id, paid_cents, owed_cents)')
        .is('deleted_at', null),
      supabase
        .from('settlements')
        .select('id, group_id, currency, from_profile, to_profile, amount_cents')
        .is('deleted_at', null),
      supabase.from('groups').select('id, name'),
    ])

  const edges = calculateScopedPairwiseDebts(
    (expenseRows ?? []).map((row) => ({
      id: row.id,
      groupId: row.group_id,
      currency: row.currency,
      participants: (row.expense_participants ?? []).map((p) => ({
        profileId: p.profile_id,
        paidCents: p.paid_cents,
        owedCents: p.owed_cents,
      })),
    })),
    (settlementRows ?? []).map((row) => ({
      id: row.id,
      groupId: row.group_id,
      currency: row.currency,
      fromProfileId: row.from_profile,
      toProfileId: row.to_profile,
      amountCents: row.amount_cents,
    }))
  )

  const groupNames = new Map((groupRows ?? []).map((g) => [g.id, g.name]))

  // Names for everyone who appears in a debt of yours.
  const counterparties = new Set<string>()
  for (const edge of edges) {
    if (edge.fromProfileId === profileId) counterparties.add(edge.toProfileId)
    if (edge.toProfileId === profileId) counterparties.add(edge.fromProfileId)
  }

  const profileNames = new Map<string, string>()
  if (counterparties.size > 0) {
    const { data: people } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', [...counterparties])
    for (const person of people ?? []) profileNames.set(person.id, person.display_name)
  }

  const overall = new Map<string, Cents>()
  for (const edge of edges) {
    if (edge.fromProfileId !== profileId && edge.toProfileId !== profileId) continue
    const signed = edge.toProfileId === profileId ? edge.amountCents : -edge.amountCents
    overall.set(edge.currency, (overall.get(edge.currency) ?? 0) + signed)
  }
  for (const [currency, amount] of overall) {
    if (amount === 0) overall.delete(currency)
  }

  return { edges, groupNames, profileNames, overall }
}

/** Your debts with one person, one line per group and currency. */
export function debtLinesWith(
  overview: Overview,
  profileId: string,
  otherId: string
): DebtLine[] {
  return scopedDebtsBetween(overview.edges, profileId, otherId).map((edge) => ({
    groupId: edge.groupId,
    groupName: edge.groupId ? (overview.groupNames.get(edge.groupId) ?? 'a group') : null,
    currency: edge.currency,
    amountCents: edge.toProfileId === profileId ? edge.amountCents : -edge.amountCents,
    otherProfileId: otherId,
    otherName: overview.profileNames.get(otherId) ?? 'Someone',
  }))
}

/** Your net position with one person, per currency. */
export function totalWith(
  overview: Overview,
  profileId: string,
  otherId: string
): Map<string, Cents> {
  return netBetween(overview.edges, profileId, otherId)
}

/** Your debts inside one group (or, with null, outside every group). */
export function debtLinesInGroup(
  overview: Overview,
  profileId: string,
  groupId: string | null
): DebtLine[] {
  return overview.edges
    .filter(
      (edge) =>
        edge.groupId === groupId &&
        (edge.fromProfileId === profileId || edge.toProfileId === profileId)
    )
    .map((edge) => {
      const otherId =
        edge.fromProfileId === profileId ? edge.toProfileId : edge.fromProfileId
      return {
        groupId: edge.groupId,
        groupName: edge.groupId ? (overview.groupNames.get(edge.groupId) ?? 'a group') : null,
        currency: edge.currency,
        amountCents: edge.toProfileId === profileId ? edge.amountCents : -edge.amountCents,
        otherProfileId: otherId,
        otherName: overview.profileNames.get(otherId) ?? 'Someone',
      }
    })
}

/**
 * What one person still owes or is owed inside a group, against anybody.
 *
 * Used to refuse removing someone mid-debt. Note it asks about *their* whole
 * position in the group, not just their position with you: letting an admin
 * remove someone who still owes a third person would quietly delete a debt
 * that was never theirs to forgive.
 */
export function outstandingInGroup(
  overview: Overview,
  profileId: string,
  groupId: string | null
): Map<string, Cents> {
  const totals = new Map<string, Cents>()

  for (const edge of overview.edges) {
    if (edge.groupId !== groupId) continue
    if (edge.fromProfileId !== profileId && edge.toProfileId !== profileId) continue
    const signed = edge.toProfileId === profileId ? edge.amountCents : -edge.amountCents
    totals.set(edge.currency, (totals.get(edge.currency) ?? 0) + signed)
  }

  for (const [currency, amount] of totals) {
    if (amount === 0) totals.delete(currency)
  }
  return totals
}

/** Sum a set of lines per currency. */
export function sumLines(lines: readonly DebtLine[]): Map<string, Cents> {
  const totals = new Map<string, Cents>()
  for (const line of lines) {
    totals.set(line.currency, (totals.get(line.currency) ?? 0) + line.amountCents)
  }
  for (const [currency, amount] of totals) {
    if (amount === 0) totals.delete(currency)
  }
  return totals
}
