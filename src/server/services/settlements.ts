import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from './session'
import { formatCents, parseAmountToCents } from '@/core/money'

export const settlementInputSchema = z.object({
  groupId: z.string().uuid().nullable(),
  fromProfileId: z.string().uuid(),
  toProfileId: z.string().uuid(),
  amount: z.string().trim().min(1, 'Enter an amount'),
  currency: z.string().length(3),
  /** Free text and optional: "EFT", "cash", "SnapScan", or nothing at all. */
  method: z.string().trim().max(60).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  settledOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export type SettlementInput = z.infer<typeof settlementInputSchema>

/**
 * Append to the record. Never throws: losing the note must not lose the
 * payment. Mirrors recordEvent in expenses.ts for the same reason.
 */
async function recordEvent(
  settlementId: string,
  actorId: string,
  kind: 'added' | 'updated' | 'deleted' | 'restored',
  changes: string[] = []
): Promise<void> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('settlement_events')
      .insert({ settlement_id: settlementId, actor_id: actorId, kind, changes })
    if (error) console.error('Could not record settlement event:', error.message)
  } catch (error) {
    console.error('Could not record settlement event:', error)
  }
}

export async function recordSettlement(input: SettlementInput): Promise<string> {
  const parsed = settlementInputSchema.parse(input)
  const me = await requireProfile()

  if (parsed.fromProfileId === parsed.toProfileId) {
    throw new Error('A payment needs two different people')
  }

  const amountCents = parseAmountToCents(parsed.amount, parsed.currency)
  if (amountCents <= 0) throw new Error('Enter an amount greater than zero')

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('settlements')
    .insert({
      group_id: parsed.groupId,
      from_profile: parsed.fromProfileId,
      to_profile: parsed.toProfileId,
      amount_cents: amountCents,
      currency: parsed.currency,
      method: parsed.method || null,
      note: parsed.note || null,
      settled_on: parsed.settledOn ?? new Date().toISOString().slice(0, 10),
      created_by: me.id,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  await recordEvent(data.id, me.id, 'added')
  return data.id
}

/** What changed, said in money and names rather than column values. */
function describeChanges(
  before: SettlementDetail,
  after: SettlementInput,
  afterCents: number,
  nameFor: Map<string, string>
): string[] {
  const lines: string[] = []

  if (before.currency !== after.currency) {
    lines.push(
      `Currency changed from ${before.currency} to ${after.currency}` +
        ` (${formatCents(before.amountCents, before.currency)} → ${formatCents(afterCents, after.currency)})`
    )
  } else if (before.amountCents !== afterCents) {
    lines.push(
      `Amount changed from ${formatCents(before.amountCents, before.currency)}` +
        ` to ${formatCents(afterCents, after.currency)}`
    )
  }

  if (
    before.fromProfileId !== after.fromProfileId ||
    before.toProfileId !== after.toProfileId
  ) {
    const from = nameFor.get(after.fromProfileId) ?? 'someone'
    const to = nameFor.get(after.toProfileId) ?? 'someone'
    lines.push(
      `Direction changed from ${before.fromName} → ${before.toName} to ${from} → ${to}`
    )
  }

  if (after.settledOn && before.settledOn !== after.settledOn) {
    lines.push(`Date changed from ${before.settledOn} to ${after.settledOn}`)
  }

  const method = after.method || null
  if ((before.method ?? null) !== method) {
    lines.push(
      method
        ? `How it was paid changed to “${method}”`
        : 'How it was paid was cleared'
    )
  }

  const note = after.note || null
  if ((before.note ?? null) !== note) {
    lines.push(note ? 'Note changed' : 'Note removed')
  }

  return lines
}

export async function updateSettlement(
  settlementId: string,
  input: SettlementInput
): Promise<string> {
  const parsed = settlementInputSchema.parse(input)
  const me = await requireProfile()

  if (parsed.fromProfileId === parsed.toProfileId) {
    throw new Error('A payment needs two different people')
  }

  const amountCents = parseAmountToCents(parsed.amount, parsed.currency)
  if (amountCents <= 0) throw new Error('Enter an amount greater than zero')

  // Read it first, so the record can say what actually changed.
  const before = await getSettlement(settlementId)
  if (!before) throw new Error('That payment no longer exists')

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('settlements')
    .update({
      from_profile: parsed.fromProfileId,
      to_profile: parsed.toProfileId,
      amount_cents: amountCents,
      currency: parsed.currency,
      method: parsed.method || null,
      note: parsed.note || null,
      settled_on: parsed.settledOn ?? before.settledOn,
    })
    .eq('id', settlementId)
    .is('deleted_at', null)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error('Only someone in this payment can edit it')
  }

  const nameFor = new Map([
    [before.fromProfileId, before.fromName],
    [before.toProfileId, before.toName],
  ])
  const changes = describeChanges(before, parsed, amountCents, nameFor)
  if (changes.length > 0) await recordEvent(settlementId, me.id, 'updated', changes)

  return settlementId
}

/**
 * Undo. A soft delete, so the row survives to explain the balances it once
 * produced — and so the history of having undone it survives with it.
 */
export async function deleteSettlement(settlementId: string): Promise<void> {
  const me = await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('settlements')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', settlementId)
    .is('deleted_at', null)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error('Only someone in this payment can undo it')
  }

  await recordEvent(settlementId, me.id, 'deleted')
}

export interface SettlementListItem {
  id: string
  groupId: string | null
  amountCents: number
  currency: string
  settledOn: string
  method: string | null
  fromProfileId: string
  fromName: string
  toProfileId: string
  toName: string
}

const LIST_COLUMNS = `id, group_id, amount_cents, currency, method, note, settled_on,
   from_profile, to_profile,
   payer:profiles!settlements_from_profile_fkey(display_name),
   payee:profiles!settlements_to_profile_fkey(display_name)`

interface SettlementRow {
  id: string
  group_id: string | null
  amount_cents: number
  currency: string
  method: string | null
  settled_on: string
  from_profile: string
  to_profile: string
  payer: { display_name: string } | null
  payee: { display_name: string } | null
}

function toListItem(row: SettlementRow): SettlementListItem {
  return {
    id: row.id,
    groupId: row.group_id,
    amountCents: row.amount_cents,
    currency: row.currency,
    settledOn: row.settled_on,
    method: row.method,
    fromProfileId: row.from_profile,
    fromName: row.payer?.display_name ?? 'Someone',
    toProfileId: row.to_profile,
    toName: row.payee?.display_name ?? 'Someone',
  }
}

/** Payments inside one group, or — with null — every one-off payment. */
export async function listSettlements(groupId: string | null): Promise<SettlementListItem[]> {
  const supabase = await createClient()

  let query = supabase
    .from('settlements')
    .select(LIST_COLUMNS)
    .is('deleted_at', null)
    .order('settled_on', { ascending: false })
    .order('created_at', { ascending: false })

  query = groupId ? query.eq('group_id', groupId) : query.is('group_id', null)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => toListItem(row as unknown as SettlementRow))
}

/**
 * Payments between you and one other person — across every group and every
 * one-off split, the same way listExpensesWithPerson gathers expenses.
 */
export async function listSettlementsWithPerson(
  profileId: string,
  otherProfileId: string
): Promise<SettlementListItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('settlements')
    .select(LIST_COLUMNS)
    .is('deleted_at', null)
    .or(
      `and(from_profile.eq.${profileId},to_profile.eq.${otherProfileId}),` +
        `and(from_profile.eq.${otherProfileId},to_profile.eq.${profileId})`
    )
    .order('settled_on', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => toListItem(row as unknown as SettlementRow))
}

export interface SettlementDetail extends SettlementListItem {
  note: string | null
  createdBy: string
  createdByName: string
  groupName: string | null
}

export async function getSettlement(settlementId: string): Promise<SettlementDetail | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('settlements')
    .select(
      `id, group_id, amount_cents, currency, method, note, settled_on, created_by,
       from_profile, to_profile,
       payer:profiles!settlements_from_profile_fkey(display_name),
       payee:profiles!settlements_to_profile_fkey(display_name),
       author:profiles!settlements_created_by_fkey(display_name),
       groups(name)`
    )
    .eq('id', settlementId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  const row = data as unknown as SettlementRow & {
    note: string | null
    created_by: string
    author: { display_name: string } | null
    groups: { name: string } | null
  }

  return {
    ...toListItem(row),
    note: row.note,
    createdBy: row.created_by,
    createdByName: row.author?.display_name ?? 'Someone',
    groupName: row.groups?.name ?? null,
  }
}

export interface SettlementEvent {
  id: string
  kind: string
  actorName: string
  actorAvatarUrl: string | null
  changes: string[]
  createdAt: string
}

/** Who has touched this payment, oldest first. */
export async function listSettlementEvents(settlementId: string): Promise<SettlementEvent[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('settlement_events')
    .select('id, kind, changes, created_at, profiles!inner(display_name, avatar_url)')
    .eq('settlement_id', settlementId)
    .order('created_at')

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => {
    const actor = row.profiles as unknown as {
      display_name: string
      avatar_url: string | null
    }
    return {
      id: row.id,
      kind: row.kind,
      actorName: actor?.display_name ?? 'Someone',
      actorAvatarUrl: actor?.avatar_url ?? null,
      changes: row.changes ?? [],
      createdAt: row.created_at,
    }
  })
}
