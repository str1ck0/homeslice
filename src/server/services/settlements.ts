import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from './session'
import { parseAmountToCents } from '@/core/money'

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
  return data.id
}

export async function listSettlements(groupId: string | null) {
  const supabase = await createClient()

  let query = supabase
    .from('settlements')
    .select(
      `id, amount_cents, currency, method, note, settled_on,
       payer:profiles!settlements_from_profile_fkey(display_name),
       payee:profiles!settlements_to_profile_fkey(display_name)`
    )
    .is('deleted_at', null)
    .order('settled_on', { ascending: false })

  query = groupId ? query.eq('group_id', groupId) : query.is('group_id', null)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}
