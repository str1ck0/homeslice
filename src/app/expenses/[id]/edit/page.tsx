import { notFound, redirect } from 'next/navigation'
import { getCurrentProfile } from '@/server/services/session'
import { getExpense } from '@/server/services/expenses'
import { getGroup, getGroupMembers, listMyGroups } from '@/server/services/groups'
import { listFriends } from '@/server/services/friends'
import { createClient } from '@/lib/supabase/server'
import { minorUnitScale, decimalPlaces } from '@/core/money'
import type { SplitType } from '@/core/split'
import ExpenseForm, { type EditingExpense } from '../../new/ExpenseForm'

export const dynamic = 'force-dynamic'

/** Cents back into the plain decimal string the amount input expects. */
function centsToInput(cents: number, currency: string): string {
  return (cents / minorUnitScale(currency)).toFixed(decimalPlaces(currency))
}

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await getCurrentProfile()
  if (!profile) redirect('/auth')

  const expense = await getExpense(id)
  if (!expense) notFound()

  // Only the person who added it can edit; the detail page hides the link, but
  // the URL is guessable so it is checked here too.
  if (expense.createdBy !== profile.id) redirect(`/expenses/${id}`)

  const supabase = await createClient()
  const [categoriesResult, groups, friends, members] = await Promise.all([
    supabase.from('categories').select('id, name').order('name'),
    listMyGroups(),
    listFriends(),
    expense.groupId ? getGroupMembers(expense.groupId) : Promise.resolve([]),
  ])

  const payers = expense.participants.filter((p) => p.paidCents > 0)

  // Turn stored per-person figures back into what the user originally typed.
  const weights: Record<string, string> = {}
  for (const participant of expense.participants) {
    if (expense.splitType === 'exact') {
      weights[participant.profileId] = centsToInput(participant.owedCents, expense.currency)
    }
  }

  const { data: rawWeights } = await supabase
    .from('expense_participants')
    .select('profile_id, split_weight')
    .eq('expense_id', id)

  for (const row of rawWeights ?? []) {
    if (row.split_weight === null) continue
    if (expense.splitType === 'percent' || expense.splitType === 'shares') {
      weights[row.profile_id] = String(row.split_weight)
    } else if (expense.splitType === 'adjustment') {
      weights[row.profile_id] = centsToInput(Number(row.split_weight), expense.currency)
    }
  }

  const editing: EditingExpense = {
    expenseId: expense.id,
    description: expense.description,
    amount: centsToInput(expense.amountCents, expense.currency),
    currency: expense.currency,
    expenseDate: expense.expenseDate,
    splitType: expense.splitType as SplitType,
    categoryId: '',
    payerId: payers[0]?.profileId ?? profile.id,
    participantIds: expense.participants
      .filter((p) => p.owedCents !== 0 || p.paidCents !== 0)
      .map((p) => p.profileId),
    weights,
    multiplePayers: payers.length > 1,
  }

  // Anyone already on the expense must stay selectable, even if they have
  // since left the group — otherwise saving would silently drop them.
  const baseMembers = expense.groupId
    ? members.map((m) => ({ id: m.profileId, name: m.displayName, avatarUrl: m.avatarUrl }))
    : friends.map((f) => ({ id: f.profileId, name: f.displayName, avatarUrl: f.avatarUrl }))

  const known = new Set(baseMembers.map((m) => m.id))
  const extras = expense.participants
    .filter((p) => !known.has(p.profileId))
    .map((p) => ({ id: p.profileId, name: p.displayName, avatarUrl: p.avatarUrl }))

  return (
    <ExpenseForm
      currentProfileId={profile.id}
      currentProfileName={profile.display_name}
      currentProfileAvatarUrl={profile.avatar_url}
      initialGroupId={expense.groupId}
      groups={groups.map((g) => ({
        id: g.id,
        name: g.name,
        currency: g.currency,
        avatarUrl: g.avatarUrl,
        memberCount: g.memberCount,
      }))}
      membersByGroup={expense.groupId ? { [expense.groupId]: [...baseMembers, ...extras] } : {}}
      friends={expense.groupId ? [] : [...baseMembers, ...extras]}
      defaultCurrency={expense.currency}
      categories={categoriesResult.data ?? []}
      editing={editing}
    />
  )
}
