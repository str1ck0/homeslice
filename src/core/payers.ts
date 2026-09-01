/**
 * Who put money into an expense.
 *
 * Usually one person, and then there is nothing to resolve: they paid the
 * total, and asking them to type it again would be a form asking a question it
 * already knows the answer to. Two or more, and each amount has to be typed and
 * the set has to add up exactly — a multi-payer expense whose payments do not
 * sum to the total is not a rounding problem, it is a different expense.
 *
 * This lives in core, next to the split maths, for the same reason that does:
 * it decides what gets written to `expense_participants.paid_cents`, so it is
 * money logic and it is tested rather than trusted.
 */

import { MoneyError, formatCents, parseAmountToCents, sumCents, type Cents } from './money'

export class PayerError extends Error {}

/** What one payer put in. `amount` is raw user input, e.g. "1 234,56". */
export interface PayerEntry {
  profileId: string
  amount: string
}

export interface ResolvedPayer {
  profileId: string
  amountCents: Cents
}

/**
 * Payers as the form holds them: profile id to the amount as typed. The value
 * is meaningless — and left alone — while there is only one payer.
 */
export type PayerAmounts = Record<string, string>

/** The only payer, or null when there are none or several. */
export function solePayer(payers: PayerAmounts): string | null {
  const ids = Object.keys(payers)
  return ids.length === 1 ? ids[0] : null
}

export function payerIds(payers: PayerAmounts): string[] {
  return Object.keys(payers)
}

/**
 * Add or remove a payer, returning a new map. Removing the last one is refused
 * by returning the map unchanged: an expense nobody paid for cannot be saved,
 * and silently emptying the set turns a mis-tap into an unexplained error at
 * the bottom of the form.
 */
export function togglePayer(payers: PayerAmounts, profileId: string): PayerAmounts {
  if (profileId in payers) {
    if (Object.keys(payers).length === 1) return payers
    const next = { ...payers }
    delete next[profileId]
    return next
  }
  return { ...payers, [profileId]: '' }
}

/** Keep only payers who are still part of the expense; never return an empty set. */
export function confinePayers(payers: PayerAmounts, memberIds: readonly string[]): PayerAmounts {
  const allowed = new Set(memberIds)
  const kept = Object.entries(payers).filter(([id]) => allowed.has(id))
  if (kept.length === 0) return {}
  return Object.fromEntries(kept)
}

/**
 * Turn typed amounts into the integer cents the service expects.
 *
 * One payer is the whole total, whatever their input string says — the form
 * does not show them a box, so there is nothing to honour. Several payers must
 * each parse and must sum to exactly the total.
 *
 * Throws `PayerError` with a message meant to be shown to the person typing.
 */
export function resolvePayers(
  payers: PayerAmounts,
  totalCents: Cents,
  currency: string
): ResolvedPayer[] {
  const ids = payerIds(payers)

  if (ids.length === 0) throw new PayerError('Say who paid')
  if (ids.length === 1) return [{ profileId: ids[0], amountCents: totalCents }]

  const resolved: ResolvedPayer[] = []
  for (const profileId of ids) {
    const raw = (payers[profileId] ?? '').trim()
    if (raw === '') throw new PayerError('Enter what each person paid')

    let amountCents: Cents
    try {
      amountCents = parseAmountToCents(raw, currency)
    } catch (error) {
      throw new PayerError(
        error instanceof MoneyError ? error.message : `${raw} is not an amount`
      )
    }

    // Zero is not a payer. Somebody who put nothing in is a participant, and
    // saying so by deleting the row is clearer than a row of zeroes that reads
    // as a payment.
    if (amountCents <= 0) throw new PayerError('A payment has to be more than nothing')

    resolved.push({ profileId, amountCents })
  }

  const paid = sumCents(resolved.map((p) => p.amountCents))
  if (paid !== totalCents) {
    const difference = totalCents - paid
    throw new PayerError(
      difference > 0
        ? `${formatCents(difference, currency)} of the total is unaccounted for`
        : `The payments are over the total by ${formatCents(-difference, currency)}`
    )
  }

  return resolved
}

/**
 * The running total for the payer editor: what is still unassigned, or how far
 * over the payments have gone. Never throws — it runs on every keystroke, and
 * half-typed input is the normal state of a form rather than an error.
 */
export function payerRemainder(
  payers: PayerAmounts,
  totalCents: Cents | null,
  currency: string
): Cents | null {
  if (totalCents === null) return null
  if (payerIds(payers).length < 2) return null

  let paid = 0
  for (const raw of Object.values(payers)) {
    const value = raw.trim()
    if (value === '') continue
    try {
      paid += parseAmountToCents(value, currency)
    } catch {
      // A half-typed amount contributes nothing rather than voiding the line.
    }
  }
  return totalCents - paid
}
