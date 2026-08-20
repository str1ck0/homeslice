/**
 * What has happened lately, ordered by when it happened.
 *
 * The dashboard used to sort Recent by the *expense* date, which quietly broke
 * the one job it has. Backdate a dinner to last Tuesday and it lands halfway
 * down the list: the balance moves, nothing visible moves with it, and the
 * app looks like it has made an arithmetic mistake. So Recent is ordered by
 * when somebody touched a thing, not by the date written on it.
 *
 * "Touched" comes from expense_events and settlement_events — the same
 * append-only record the detail pages already show — which is why an entry can
 * say who did it. Rows predating that record (before 13 August) have no events
 * and fall back to their own created_at.
 *
 * Deletions are included, and are the reason this reads the soft-deleted rows
 * that every other query filters out. A deleted expense is exactly the case
 * that started this: the money changes and the cause disappears. It appears
 * struck through and does not link anywhere, because there is no page for an
 * expense that is gone.
 */

import { createClient } from '@/lib/supabase/server'
import type { ExpenseListItem } from './expenses'
import type { SettlementListItem } from './settlements'

export type ActivityAction = 'added' | 'updated' | 'deleted' | 'restored'

interface ActivityStamp {
  action: ActivityAction
  /** Null when the row predates the event record. */
  actorName: string | null
  actorIsYou: boolean
  at: string
}

export type ActivityEntry =
  | { kind: 'expense'; id: string; at: string; stamp: ActivityStamp; deleted: boolean
      groupName: string | null; expense: ExpenseListItem }
  | { kind: 'settlement'; id: string; at: string; stamp: ActivityStamp; deleted: boolean
      groupName: string | null; settlement: SettlementListItem }

interface EventRow {
  kind: string
  created_at: string
  actor_id: string
  profiles: { display_name: string } | null
}

/** The newest event per subject id. Events arrive newest first, so first wins. */
function latestBySubject<T extends EventRow>(
  rows: T[],
  subjectIdOf: (row: T) => string,
  profileId: string
): Map<string, ActivityStamp> {
  const latest = new Map<string, ActivityStamp>()
  for (const row of rows) {
    const subjectId = subjectIdOf(row)
    if (latest.has(subjectId)) continue
    latest.set(subjectId, {
      action: row.kind as ActivityAction,
      actorName: row.profiles?.display_name ?? null,
      actorIsYou: row.actor_id === profileId,
      at: row.created_at,
    })
  }
  return latest
}

export async function listRecentActivity(
  profileId: string,
  limit = 30
): Promise<ActivityEntry[]> {
  const supabase = await createClient()

  // Unbounded on purpose, the same way getOverview is: RLS already limits every
  // one of these to rows this person is part of, and a limit applied before the
  // merge would drop an old expense that was edited this morning.
  const [
    { data: expenseRows },
    { data: settlementRows },
    { data: expenseEvents },
    { data: settlementEvents },
    { data: groupRows },
  ] = await Promise.all([
    supabase
      .from('expenses')
      .select(
        `id, group_id, description, amount_cents, currency, expense_date, created_at, deleted_at,
         categories(name),
         expense_participants(profile_id, paid_cents, owed_cents, profiles(display_name)),
         expense_images(count)`
      )
      .order('created_at', { ascending: false }),
    supabase
      .from('settlements')
      .select(
        `id, group_id, amount_cents, currency, method, settled_on, created_at, deleted_at,
         from_profile, to_profile,
         payer:profiles!settlements_from_profile_fkey(display_name),
         payee:profiles!settlements_to_profile_fkey(display_name)`
      )
      .order('created_at', { ascending: false }),
    supabase
      .from('expense_events')
      .select('expense_id, kind, actor_id, created_at, profiles(display_name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('settlement_events')
      .select('settlement_id, kind, actor_id, created_at, profiles(display_name)')
      .order('created_at', { ascending: false }),
    supabase.from('groups').select('id, name'),
  ])

  const groupNames = new Map((groupRows ?? []).map((g) => [g.id, g.name]))
  const expenseStamps = latestBySubject(
    (expenseEvents ?? []) as unknown as (EventRow & { expense_id: string })[],
    (row) => row.expense_id,
    profileId
  )
  const settlementStamps = latestBySubject(
    (settlementEvents ?? []) as unknown as (EventRow & { settlement_id: string })[],
    (row) => row.settlement_id,
    profileId
  )

  const entries: ActivityEntry[] = []

  for (const row of expenseRows ?? []) {
    const participants = (row.expense_participants ?? []) as unknown as {
      profile_id: string
      paid_cents: number
      owed_cents: number
      profiles: { display_name: string } | null
    }[]

    // Not filtered to expenses you are in: a split between two other people in
    // your group is still something that happened in your group, and the row
    // says "not involved" when your share is nothing.
    const mine = participants.find((p) => p.profile_id === profileId)

    const stamp: ActivityStamp = expenseStamps.get(row.id) ?? {
      action: row.deleted_at ? 'deleted' : 'added',
      actorName: null,
      actorIsYou: false,
      at: row.deleted_at ?? row.created_at,
    }

    entries.push({
      kind: 'expense',
      id: row.id,
      at: stamp.at,
      stamp,
      deleted: Boolean(row.deleted_at),
      groupName: row.group_id ? (groupNames.get(row.group_id) ?? 'a group') : null,
      expense: {
        id: row.id,
        groupId: row.group_id,
        description: row.description,
        amountCents: row.amount_cents,
        currency: row.currency,
        expenseDate: row.expense_date,
        categoryName: (row.categories as unknown as { name: string } | null)?.name ?? null,
        paidByNames: participants
          .filter((p) => p.paid_cents > 0)
          .map((p) => p.profiles?.display_name ?? 'Someone'),
        yourShareCents: mine?.owed_cents ?? 0,
        yourPaidCents: mine?.paid_cents ?? 0,
        imageCount:
          (row.expense_images as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
      },
    })
  }

  for (const row of settlementRows ?? []) {
    const stamp: ActivityStamp = settlementStamps.get(row.id) ?? {
      action: row.deleted_at ? 'deleted' : 'added',
      actorName: null,
      actorIsYou: false,
      at: row.deleted_at ?? row.created_at,
    }

    const payer = row.payer as unknown as { display_name: string } | null
    const payee = row.payee as unknown as { display_name: string } | null

    entries.push({
      kind: 'settlement',
      id: row.id,
      at: stamp.at,
      stamp,
      deleted: Boolean(row.deleted_at),
      groupName: row.group_id ? (groupNames.get(row.group_id) ?? 'a group') : null,
      settlement: {
        id: row.id,
        groupId: row.group_id,
        amountCents: row.amount_cents,
        currency: row.currency,
        settledOn: row.settled_on,
        method: row.method,
        fromProfileId: row.from_profile,
        fromName: payer?.display_name ?? 'Someone',
        toProfileId: row.to_profile,
        toName: payee?.display_name ?? 'Someone',
      },
    })
  }

  // Compared as instants, not strings: PostgREST writes "+00:00" where
  // toISOString writes "Z", so two timestamps in the same second sort by
  // punctuation if you compare the text.
  return entries
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit)
}
