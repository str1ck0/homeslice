import { notFound, redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/services/session'
import { listFriends } from '@/server/services/friends'
import { createClient } from '@/lib/supabase/server'
import { calculatePairwiseDebts } from '@/core/balances'
import SettleForm from '@/app/groups/[id]/settle/SettleForm'

export const dynamic = 'force-dynamic'

export default async function SettleWithFriendPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await getCurrentProfile()
  if (!profile) redirect('/auth')

  const friends = await listFriends()
  const friend = friends.find((f) => f.profileId === id)
  if (!friend) notFound()

  const supabase = await createClient()
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

  const suggestions = calculatePairwiseDebts(
    (expenseRows ?? []).map((row) => ({
      id: row.id,
      currency: row.currency,
      participants: (row.expense_participants ?? []).map((p) => ({
        profileId: p.profile_id,
        paidCents: p.paid_cents,
        owedCents: p.owed_cents,
      })),
    })),
    (settlementRows ?? []).map((row) => ({
      id: row.id,
      currency: row.currency,
      fromProfileId: row.from_profile,
      toProfileId: row.to_profile,
      amountCents: row.amount_cents,
    }))
  )
    .filter(
      (edge) =>
        (edge.fromProfileId === profile.id && edge.toProfileId === friend.profileId) ||
        (edge.fromProfileId === friend.profileId && edge.toProfileId === profile.id)
    )
    .map((edge) => ({
      fromProfileId: edge.fromProfileId,
      toProfileId: edge.toProfileId,
      currency: edge.currency,
      amountCents: edge.amountCents,
    }))

  return (
    <SettleForm
      groupId={null}
      groupName={friend.displayName}
      backHref={`/friends/${friend.profileId}`}
      currentProfileId={profile.id}
      defaultCurrency={suggestions[0]?.currency ?? profile.default_currency}
      members={[
        { id: profile.id, name: profile.display_name },
        { id: friend.profileId, name: friend.displayName },
      ]}
      suggestions={suggestions}
    />
  )
}
