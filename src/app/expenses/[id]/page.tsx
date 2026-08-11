import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/services/session'
import { getExpense } from '@/server/services/expenses'
import { Amount, Avatar, Card } from '@/components/ui'
import { formatCents } from '@/core/money'
import DeleteExpenseButton from './DeleteExpenseButton'

export const dynamic = 'force-dynamic'

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

  const backHref = expense.groupId ? `/groups/${expense.groupId}` : '/dashboard'
  const payers = expense.participants.filter((p) => p.paidCents > 0)
  const yours = expense.participants.find((p) => p.profileId === profile.id)
  const yourNet = (yours?.paidCents ?? 0) - (yours?.owedCents ?? 0)
  const canEdit = expense.createdBy === profile.id

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
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">
          {SPLIT_LABELS[expense.splitType] ?? 'Split'}
        </h2>
        <Card className="divide-y divide-edge">
          {expense.participants.map((participant) => (
            <div key={participant.profileId} className="flex items-center gap-3 p-4">
              <Avatar name={participant.displayName} size={36} />
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
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">
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

      {expense.note && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">Note</h2>
          <Card className="p-4 text-sm">{expense.note}</Card>
        </section>
      )}

      <p className="text-xs text-muted">Added by {expense.createdByName}</p>

      {canEdit && <DeleteExpenseButton expenseId={expense.id} groupId={expense.groupId} />}
    </div>
  )
}
