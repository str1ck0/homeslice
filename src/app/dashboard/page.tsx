import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/services/session'
import { getOverview } from '@/server/services/overview'
import { listFriends } from '@/server/services/friends'
import { listMyGroups } from '@/server/services/groups'
import { createClient } from '@/lib/supabase/server'
import { BalanceSummary, Card, EmptyState, ExpenseRow, PageShell } from '@/components/ui'

// Balances change on every expense, so this page is always rendered fresh.
export const dynamic = 'force-dynamic'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>
}) {
  const { welcome } = await searchParams
  const profile = await getCurrentProfile()
  if (!profile) redirect('/auth')

  const supabase = await createClient()
  const [overview, groups, friends, { data: recentRows }] = await Promise.all([
    getOverview(profile.id),
    listMyGroups(),
    listFriends(),
    // Everything recent, group or not. The dashboard used to list only groups,
    // which left a one-off split invisible the moment it was created.
    supabase
      .from('expenses')
      .select(
        `id, description, amount_cents, currency, expense_date,
         expense_participants(profile_id, paid_cents, owed_cents, profiles(display_name)),
         expense_images(count)`
      )
      .is('deleted_at', null)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const recent = (recentRows ?? []).map((expense) => {
    const participants = (expense.expense_participants ?? []) as unknown as {
      profile_id: string
      paid_cents: number
      owed_cents: number
      profiles: { display_name: string } | null
    }[]
    const mine = participants.find((p) => p.profile_id === profile.id)
    return {
      id: expense.id,
      description: expense.description,
      amountCents: expense.amount_cents,
      currency: expense.currency,
      expenseDate: expense.expense_date,
      paidByNames: participants
        .filter((p) => p.paid_cents > 0)
        .map((p) => p.profiles?.display_name ?? 'Someone'),
      yourShareCents: mine?.owed_cents ?? 0,
      yourPaidCents: mine?.paid_cents ?? 0,
      imageCount:
        (expense.expense_images as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
    }
  })

  const owed = [...overview.overall.values()].some((cents) => cents > 0)
  const isNew = groups.length === 0 && friends.length === 0

  return (
    <PageShell
      title={`Hi ${profile.display_name.split(' ')[0]}`}
      nav="home"
      action={
        <Link
          href="/expenses/new"
          className="rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white"
        >
          Add expense
        </Link>
      }
    >
      {welcome && (
        <p
          role="status"
          className="mb-6 rounded-xl bg-positive/10 px-4 py-3 text-sm font-medium text-positive"
        >
          Signed in. Welcome back, {profile.display_name}.
        </p>
      )}

      {overview.overall.size === 0 ? (
        <Card className="mb-6 p-5">
          <p className="text-sm text-muted">
            {isNew
              ? 'Add a friend or create a group, then split something.'
              : "You're all square. Nothing outstanding."}
          </p>
        </Card>
      ) : (
        <Link
          href="/friends"
          className="mb-6 block rounded-2xl border border-edge bg-raised p-5 transition-colors hover:border-accent/50"
        >
          <BalanceSummary totals={overview.overall} size="lg" />
          <p className="mt-3 text-sm text-accent">See who &rarr;</p>
        </Link>
      )}

      {isNew ? (
        <Card>
          <EmptyState
            title="Nothing here yet"
            body="Split with a friend without any setup, or make a group for a house, a flat or a trip."
            action={
              <div className="mt-2 flex gap-2">
                <Link
                  href="/friends"
                  className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Add a friend
                </Link>
                <Link
                  href="/groups/new"
                  className="rounded-xl border border-edge px-5 py-2.5 text-sm font-semibold"
                >
                  New group
                </Link>
              </div>
            }
          />
        </Card>
      ) : (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            Recent
          </h2>
          {recent.length === 0 ? (
            <Card className="p-5">
              <p className="text-sm text-muted">No expenses yet.</p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-2">
              {recent.map((expense) => (
                <li key={expense.id}>
                  <ExpenseRow expense={expense} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </PageShell>
  )
}
