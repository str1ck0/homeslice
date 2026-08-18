import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/services/session'
import { getSettlement, listSettlementEvents } from '@/server/services/settlements'
import { Avatar, Card } from '@/components/ui'
import { formatCents } from '@/core/money'
import DeleteSettlementButton from './DeleteSettlementButton'

export const dynamic = 'force-dynamic'

const EVENT_VERBS: Record<string, string> = {
  added: 'recorded',
  updated: 'edited',
  deleted: 'undid',
  restored: 'restored',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Dates only, assembled by hand — the same reasoning as the expense page. */
function formatWhen(iso: string): string {
  const when = new Date(iso)
  return `${when.getDate()} ${MONTHS[when.getMonth()]} ${when.getFullYear()}`
}

export default async function SettlementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getCurrentProfile()
  if (!profile) redirect('/auth')

  const settlement = await getSettlement(id)
  if (!settlement) notFound()

  const events = await listSettlementEvents(id)

  const youPaid = settlement.fromProfileId === profile.id
  const youWerePaid = settlement.toProfileId === profile.id
  const other = youPaid ? settlement.toProfileId : settlement.fromProfileId

  // Back to wherever this payment is listed: its group, or the friend page of
  // the other person, which is the only home a one-off payment has.
  const backHref = settlement.groupId
    ? `/groups/${settlement.groupId}`
    : youPaid || youWerePaid
      ? `/friends/${other}`
      : '/dashboard'

  // Either party, not just whoever typed it in — the person who was paid is as
  // entitled to correct the amount as the person who paid.
  const canEdit = youPaid || youWerePaid || settlement.createdBy === profile.id

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-5 py-8 pb-16">
      <Link href={backHref} className="text-sm text-muted hover:text-ink">
        ← Back
      </Link>

      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-muted">Payment</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-balance">
          {youPaid
            ? `You paid ${settlement.toName}`
            : youWerePaid
              ? `${settlement.fromName} paid you`
              : `${settlement.fromName} paid ${settlement.toName}`}
        </h1>
        <p className="amount mt-1 text-3xl font-bold">
          {formatCents(settlement.amountCents, settlement.currency)}
        </p>
        <p className="mt-2 text-sm text-muted">
          {new Date(`${settlement.settledOn}T00:00:00`).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
          {settlement.method ? ` · ${settlement.method}` : ''}
          {settlement.groupName ? ` · ${settlement.groupName}` : ''}
        </p>
      </div>

      <Card className="p-5">
        <p className="text-sm text-muted">
          Money that moved between two people, so it reduces what{' '}
          {youPaid
            ? `you owe ${settlement.toName}`
            : youWerePaid
              ? `${settlement.fromName} owes you`
              : `${settlement.fromName} owes ${settlement.toName}`}
          . Nothing here was split — for that, add an expense instead.
        </p>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
          Who paid whom
        </h2>
        <Card className="divide-y divide-edge">
          <div className="flex items-center gap-3 p-4">
            <Avatar name={settlement.fromName} url={null} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {settlement.fromName}
                {youPaid && <span className="ml-1.5 text-muted">(you)</span>}
              </p>
              <p className="text-xs text-muted">paid</p>
            </div>
            <span className="amount text-sm font-semibold text-negative">
              −{formatCents(settlement.amountCents, settlement.currency)}
            </span>
          </div>
          <div className="flex items-center gap-3 p-4">
            <Avatar name={settlement.toName} url={null} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {settlement.toName}
                {youWerePaid && <span className="ml-1.5 text-muted">(you)</span>}
              </p>
              <p className="text-xs text-muted">received</p>
            </div>
            <span className="amount text-sm font-semibold text-positive">
              +{formatCents(settlement.amountCents, settlement.currency)}
            </span>
          </div>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">History</h2>
        <Card className="divide-y divide-edge">
          {events.length === 0 ? (
            <p className="p-4 text-sm text-muted">
              Recorded by {settlement.createdByName}. Changes from here on are recorded.
            </p>
          ) : (
            events.map((event) => (
              <div key={event.id} className="flex items-start gap-3 p-4">
                <Avatar name={event.actorName} url={event.actorAvatarUrl} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">
                      {event.actorName === profile.display_name ? 'You' : event.actorName}
                    </span>{' '}
                    {EVENT_VERBS[event.kind] ?? event.kind} this payment
                    <span className="text-muted"> · {formatWhen(event.createdAt)}</span>
                  </p>
                  {event.changes.length > 0 && (
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {event.changes.map((change) => (
                        <li key={change} className="text-sm text-muted">
                          {change}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))
          )}
        </Card>
      </section>

      {settlement.note && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Note</h2>
          <Card className="p-4 text-sm">{settlement.note}</Card>
        </section>
      )}

      {canEdit && (
        <>
          <Link
            href={`/settlements/${settlement.id}/edit`}
            className="mt-2 block rounded-xl border border-accent px-4 py-3 text-center text-sm font-semibold text-accent"
          >
            Edit payment
          </Link>
          <DeleteSettlementButton
            settlementId={settlement.id}
            groupId={settlement.groupId}
            fromProfileId={settlement.fromProfileId}
            toProfileId={settlement.toProfileId}
            backHref={backHref}
          />
        </>
      )}
    </div>
  )
}
