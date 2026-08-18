import { notFound, redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/services/session'
import { getSettlement } from '@/server/services/settlements'
import { formatCents } from '@/core/money'
import SettleForm from '@/app/groups/[id]/settle/SettleForm'

export const dynamic = 'force-dynamic'

export default async function EditSettlementPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await getCurrentProfile()
  if (!profile) redirect('/auth')

  const settlement = await getSettlement(id)
  if (!settlement) notFound()

  const involved =
    settlement.fromProfileId === profile.id ||
    settlement.toProfileId === profile.id ||
    settlement.createdBy === profile.id
  if (!involved) redirect(`/settlements/${id}`)

  return (
    <SettleForm
      groupId={settlement.groupId}
      groupName={settlement.groupName ?? ''}
      backHref={`/settlements/${id}`}
      currentProfileId={profile.id}
      defaultCurrency={settlement.currency}
      // Only the two people in the payment. Swapping the direction is a real
      // correction ("it was actually them who paid me"); moving it onto a
      // third person is a different payment, and should be recorded as one.
      members={[
        { id: settlement.fromProfileId, name: settlement.fromName },
        { id: settlement.toProfileId, name: settlement.toName },
      ]}
      suggestions={[]}
      existing={{
        id: settlement.id,
        fromProfileId: settlement.fromProfileId,
        toProfileId: settlement.toProfileId,
        amount: formatCents(settlement.amountCents, settlement.currency, { showSymbol: false }),
        currency: settlement.currency,
        method: settlement.method ?? '',
        note: settlement.note,
        settledOn: settlement.settledOn,
      }}
    />
  )
}
