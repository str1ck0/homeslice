import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/services/session'
import { getExpense, listExpenseEvents } from '@/server/services/expenses'
import { Amount, Avatar, Card } from '@/components/ui'
import { formatCents } from '@/core/money'
import DeleteExpenseButton from './DeleteExpenseButton'

export const dynamic = 'force-dynamic'

const EVENT_VERBS: Record<string, string> = {
  added: 'added',
  updated: 'edited',
  deleted: 'deleted',
  restored: 'restored',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Dates only — the hour something was edited is noise a week later. Assembled
 * by hand for the same reason money is: toLocaleDateString reads the runtime's
 * locale data, and Node's does not always agree with the browser's.
 */
function formatWhen(iso: string): string {
  const when = new Date(iso)
  return `${when.getDate()} ${MONTHS[when.getMonth()]} ${when.getFullYear()}`
}

const SPLIT_LABELS: Record<string, string> = {
  equal: 'Split equally',
  exact: 'Split by exact amounts',
  percent: 'Split by percentage',
  shares: 'Split by shares',
  adjustment: 'Split with adjustments',
}

export default async function ExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getCurrentProfile()
  if (!profile) redirect('/auth')

  const expense = await getExpense(id)
  if (!expense) notFound()

  const events = await listExpenseEvents(id)

  const backHref = expense.groupId ? `/groups/${expense.groupId}` : '/dashboard'
  const payers = expense.participants.filter((p) => p.paidCents > 0)
  const yours = expense.participants.find((p) => p.profileId === profile.id)
  const yourNet = (yours?.paidCents ?? 0) - (yours?.owedCents ?? 0)
  // Anyone in the expense, not just whoever typed it in. Sam telling you the
  // beers were €5 should not mean asking them to go and fix it.
  const canEdit = expense.createdBy === profile.id || Boolean(yours)

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-5 py-8 pb-16">
      <Link href={backHref} className="text-sm text-muted hover:text-ink">
        ← Back
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-balance">{expense.description}</h1>
        <p className="amount mt-1 text-3xl font-bold">
          {formatCents(expense.amountCents, expense.currency)}
        </p>
        <p className="mt-2 text-sm text-muted">
          {payers.length > 0
            ? `${payers.map((p) => p.displayName).join(' & ')} paid`
            : 'No payer recorded'}
          {' · '}
          {new Date(`${expense.expenseDate}T00:00:00`).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
          {expense.categoryName ? ` · ${expense.categoryName}` : ''}
        </p>
      </div>

      {yours && (
        <Card className="flex items-baseline justify-between gap-4 p-5">
          <span className="text-sm text-muted">
            {yourNet > 0 ? 'You lent' : yourNet < 0 ? 'You owe' : 'You are square on this'}
          </span>
          {yourNet !== 0 && (
            <Amount cents={yourNet} currency={expense.currency} className="text-xl font-bold" />
          )}
        </Card>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
          {SPLIT_LABELS[expense.splitType] ?? 'Split'}
        </h2>
        <Card className="divide-y divide-edge">
          {expense.participants.map((participant) => (
            <div key={participant.profileId} className="flex items-center gap-3 p-4">
              <Avatar name={participant.displayName} url={participant.avatarUrl} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {participant.displayName}
                  {participant.profileId === profile.id && (
                    <span className="ml-1.5 text-muted">(you)</span>
                  )}
                </p>
                {participant.paidCents > 0 && (
                  <p className="text-xs text-muted">
                    paid {formatCents(participant.paidCents, expense.currency)}
                  </p>
                )}
              </div>
              <span className="amount text-sm font-semibold">
                {formatCents(participant.owedCents, expense.currency)}
              </span>
            </div>
          ))}
        </Card>
      </section>

      {expense.imageIds.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            Photos
          </h2>
          <div className="flex flex-wrap gap-2">
            {expense.imageIds.map((imageId, index) => (
              <a
                key={imageId}
                href={`/api/expense-images/${imageId}`}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                {/* Served through an API route that checks access and signs a
                    short-lived URL, so the bucket itself stays private. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/expense-images/${imageId}`}
                  alt={`Receipt ${index + 1}`}
                  className="h-28 w-28 rounded-xl border border-edge object-cover"
                />
              </a>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
          History
        </h2>
        <Card className="divide-y divide-edge">
          {events.length === 0 ? (
            <p className="p-4 text-sm text-muted">
              Added by {expense.createdByName}. Changes from here on are recorded.
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
                    {EVENT_VERBS[event.kind] ?? event.kind} this expense
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

      {expense.note && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">Note</h2>
          <Card className="p-4 text-sm">{expense.note}</Card>
        </section>
      )}

      {canEdit && (
        <>
          <Link
            href={`/expenses/${expense.id}/edit`}
            className="mt-2 block rounded-xl border border-accent px-4 py-3 text-center text-sm font-semibold text-accent"
          >
            Edit expense
          </Link>
          <DeleteExpenseButton expenseId={expense.id} groupId={expense.groupId} />
        </>
      )}
    </div>
  )
}
