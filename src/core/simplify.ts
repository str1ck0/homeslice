/**
 * Debt simplification.
 *
 * Given net balances, produce the smallest practical set of payments that
 * settles everyone up. If Alice owes Bob R100 and Bob owes Carol R100, the
 * simplified plan is a single payment from Alice to Carol.
 *
 * The algorithm is greedy min-cash-flow: repeatedly match the largest creditor
 * with the largest debtor. This is not guaranteed optimal — finding the true
 * minimum is NP-hard — but it never produces more than n-1 payments and
 * matches what Splitwise does in practice.
 *
 * Opt-in per group via `groups.simplify_debts`, because some people would
 * rather pay the person they actually ate dinner with.
 */

import { type Cents } from './money'
import type { DebtEdge, NetBalances } from './balances'

/**
 * Reduce net balances to a minimal payment plan, per currency.
 *
 * Guarantees, all asserted in the test suite:
 *   - every person's net position is unchanged by executing the plan
 *   - no plan is longer than (number of people with a non-zero balance) - 1
 *   - the result is deterministic for a given input
 */
export function simplifyDebts(balances: NetBalances): DebtEdge[] {
  const plan: DebtEdge[] = []

  for (const [currency, bucket] of balances) {
    const creditors: { profileId: string; amount: Cents }[] = []
    const debtors: { profileId: string; amount: Cents }[] = []

    for (const [profileId, amount] of bucket) {
      if (amount > 0) creditors.push({ profileId, amount })
      else if (amount < 0) debtors.push({ profileId, amount: -amount })
    }

    // Largest first; profile id breaks ties so the plan is stable across runs.
    const byAmountDesc = (
      a: { profileId: string; amount: Cents },
      b: { profileId: string; amount: Cents }
    ) => b.amount - a.amount || a.profileId.localeCompare(b.profileId)

    creditors.sort(byAmountDesc)
    debtors.sort(byAmountDesc)

    let i = 0
    let j = 0
    while (i < creditors.length && j < debtors.length) {
      const creditor = creditors[i]
      const debtor = debtors[j]
      const transfer = Math.min(creditor.amount, debtor.amount)

      if (transfer > 0) {
        plan.push({
          fromProfileId: debtor.profileId,
          toProfileId: creditor.profileId,
          currency,
          amountCents: transfer,
        })
      }

      creditor.amount -= transfer
      debtor.amount -= transfer
      if (creditor.amount === 0) i += 1
      if (debtor.amount === 0) j += 1
    }
  }

  return plan.sort(
    (a, b) =>
      a.currency.localeCompare(b.currency) ||
      b.amountCents - a.amountCents ||
      a.fromProfileId.localeCompare(b.fromProfileId)
  )
}

/**
 * The payments one person needs to make or receive to be square.
 * Drives the "Settle up" screen's suggested amounts.
 */
export function settlementSuggestionsFor(plan: readonly DebtEdge[], profileId: string) {
  return {
    toPay: plan.filter((e) => e.fromProfileId === profileId),
    toReceive: plan.filter((e) => e.toProfileId === profileId),
  }
}
