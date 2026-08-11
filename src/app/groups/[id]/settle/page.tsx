import { notFound, redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/services/session'
import { getGroup, getGroupMembers } from '@/server/services/groups'
import { getBalances } from '@/server/services/balances'
import SettleForm from './SettleForm'

export const dynamic = 'force-dynamic'

export default async function SettlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getCurrentProfile()
  if (!profile) redirect('/auth')

  const group = await getGroup(id).catch(() => null)
  if (!group) notFound()

  const [members, balances] = await Promise.all([
    getGroupMembers(id),
    getBalances(id, profile.id),
  ])

  // Suggest the debts this person is actually part of, pre-filled.
  const suggestions = (group.simplify_debts ? balances.simplified : balances.pairwise)
    .filter((edge) => edge.fromProfileId === profile.id || edge.toProfileId === profile.id)
    .map((edge) => ({
      fromProfileId: edge.fromProfileId,
      toProfileId: edge.toProfileId,
      currency: edge.currency,
      amountCents: edge.amountCents,
    }))

  return (
    <SettleForm
      groupId={id}
      groupName={group.name}
      currentProfileId={profile.id}
      defaultCurrency={group.currency}
      members={members.map((m) => ({ id: m.profileId, name: m.displayName }))}
      suggestions={suggestions}
    />
  )
}
