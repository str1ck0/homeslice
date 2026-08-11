/**
 * Splitting an expense total across people.
 *
 * Every function here returns integer cents that sum to *exactly* the total.
 * That invariant is the whole point of this module: if a split is off by a
 * cent, balances never settle to zero and the app slowly drifts into nonsense.
 *
 * Remainder rules (documented because they are the source of subtle bugs):
 *
 *   equal   — base = floor(total / n), then one extra cent to the first
 *             `remainder` participants ordered by profile id. Deterministic,
 *             so the same expense always splits the same way.
 *   percent — largest-remainder method: floor each exact share, then hand the
 *             leftover cents to whoever has the largest fractional part.
 *   shares  — same as percent, with arbitrary positive weights.
 *   exact   — supplied by the user, validated to sum to the total.
 *   adjust  — each person's fixed +/- amount is applied first, and whatever
 *             remains is split equally among everyone.
 */

import { type Cents, assertValidCents, sumCents } from './money'

export const SPLIT_TYPES = ['equal', 'exact', 'percent', 'shares', 'adjustment'] as const
export type SplitType = (typeof SPLIT_TYPES)[number]

export class SplitError extends Error {}

export interface SplitParticipantInput {
  profileId: string
  /**
   * Meaning depends on the split type:
   *   exact      — the person's share in cents
   *   percent    — percentage points (all must sum to 100)
   *   shares     — share count, any positive number
   *   adjustment — fixed +/- amount in cents
   *   equal      — ignored
   */
  weight?: number
}

export interface SplitShare {
  profileId: string
  owedCents: Cents
  /** The weight as entered, stored so editing an expense round-trips faithfully. */
  splitWeight: number | null
}

function assertParticipants(participants: readonly SplitParticipantInput[]): void {
  if (participants.length === 0) {
    throw new SplitError('Choose at least one person to split with')
  }
  const seen = new Set<string>()
  for (const p of participants) {
    if (seen.has(p.profileId)) {
      throw new SplitError('The same person cannot appear twice in one split')
    }
    seen.add(p.profileId)
  }
}

/** Stable ordering so a given expense always splits identically. */
function byProfileId(a: { profileId: string }, b: { profileId: string }): number {
  return a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0
}

/**
 * Split a total equally, distributing the leftover cents one at a time to the
 * lowest profile ids. splitEqual(1000, 3) -> [334, 333, 333].
 */
export function splitEqual(
  total: Cents,
  participants: readonly SplitParticipantInput[]
): SplitShare[] {
  assertValidCents(total, 'total')
  assertParticipants(participants)

  const ordered = [...participants].sort(byProfileId)
  const n = ordered.length
  const negative = total < 0
  const magnitude = Math.abs(total)

  const base = Math.floor(magnitude / n)
  const remainder = magnitude - base * n

  return ordered.map((p, index) => {
    const amount = base + (index < remainder ? 1 : 0)
    return {
      profileId: p.profileId,
      owedCents: negative ? -amount : amount,
      splitWeight: null,
    }
  })
}

/**
 * Distribute a total across weights using the largest-remainder method, so the
 * shares always sum to exactly the total and the rounding error is spread
 * fairly rather than dumped on one person.
 */
function distributeByWeight(
  total: Cents,
  participants: readonly SplitParticipantInput[],
  weights: readonly number[]
): SplitShare[] {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  if (totalWeight <= 0) {
    throw new SplitError('The shares must add up to more than zero')
  }

  const negative = total < 0
  const magnitude = Math.abs(total)

  const exact = weights.map((w) => (magnitude * w) / totalWeight)
  const floors = exact.map(Math.floor)
  const distributed = floors.reduce((sum, f) => sum + f, 0)
  let remainder = magnitude - distributed

  // Rank by fractional part descending, breaking ties on profile id so the
  // result is deterministic rather than dependent on input order.
  const ranked = exact
    .map((value, index) => ({ index, frac: value - floors[index] }))
    .sort((a, b) => {
      if (b.frac !== a.frac) return b.frac - a.frac
      return byProfileId(participants[a.index], participants[b.index])
    })

  const amounts = [...floors]
  for (const { index } of ranked) {
    if (remainder <= 0) break
    amounts[index] += 1
    remainder -= 1
  }

  return participants.map((p, index) => ({
    profileId: p.profileId,
    owedCents: negative ? -amounts[index] : amounts[index],
    splitWeight: weights[index],
  }))
}

/** Split by percentage points, which must sum to 100. */
export function splitByPercent(
  total: Cents,
  participants: readonly SplitParticipantInput[]
): SplitShare[] {
  assertValidCents(total, 'total')
  assertParticipants(participants)

  const weights = participants.map((p) => {
    const w = p.weight ?? 0
    if (!Number.isFinite(w) || w < 0) {
      throw new SplitError('Percentages must be zero or more')
    }
    return w
  })

  const sum = weights.reduce((a, b) => a + b, 0)
  // Tolerate float dust from inputs like 33.33 + 33.33 + 33.34.
  if (Math.abs(sum - 100) > 0.001) {
    const formatted = Number(sum.toFixed(2))
    throw new SplitError(`Percentages must add up to 100% — they currently add up to ${formatted}%`)
  }

  return distributeByWeight(total, participants, weights)
}

/** Split by share counts — "Sam gets 2 shares, everyone else 1". */
export function splitByShares(
  total: Cents,
  participants: readonly SplitParticipantInput[]
): SplitShare[] {
  assertValidCents(total, 'total')
  assertParticipants(participants)

  const weights = participants.map((p) => {
    const w = p.weight ?? 0
    if (!Number.isFinite(w) || w < 0) {
      throw new SplitError('Shares must be zero or more')
    }
    return w
  })

  if (weights.every((w) => w === 0)) {
    throw new SplitError('At least one person needs a share greater than zero')
  }

  return distributeByWeight(total, participants, weights)
}

/** Each person's share is given explicitly in cents; they must sum to the total. */
export function splitByExactAmounts(
  total: Cents,
  participants: readonly SplitParticipantInput[]
): SplitShare[] {
  assertValidCents(total, 'total')
  assertParticipants(participants)

  const amounts = participants.map((p) => {
    const w = p.weight ?? 0
    assertValidCents(w, "each person's share")
    return w
  })

  const sum = sumCents(amounts)
  if (sum !== total) {
    const difference = total - sum
    throw new SplitError(
      difference > 0
        ? `The shares are ${difference} cents short of the total`
        : `The shares are ${Math.abs(difference)} cents over the total`
    )
  }

  return participants.map((p, index) => ({
    profileId: p.profileId,
    owedCents: amounts[index],
    splitWeight: amounts[index],
  }))
}

/**
 * Apply a fixed +/- adjustment per person, then split the balance equally.
 * "Dinner was R600, but Sam's cocktail was R80 extra" -> Sam +8000.
 */
export function splitByAdjustment(
  total: Cents,
  participants: readonly SplitParticipantInput[]
): SplitShare[] {
  assertValidCents(total, 'total')
  assertParticipants(participants)

  const adjustments = participants.map((p) => {
    const w = p.weight ?? 0
    assertValidCents(w, 'each adjustment')
    return w
  })

  const adjustmentTotal = sumCents(adjustments)
  const remaining = total - adjustmentTotal
  if (remaining < 0) {
    throw new SplitError('The adjustments add up to more than the total')
  }

  const equalShares = splitEqual(remaining, participants)
  const equalByProfile = new Map(equalShares.map((s) => [s.profileId, s.owedCents]))

  return participants.map((p, index) => ({
    profileId: p.profileId,
    owedCents: adjustments[index] + (equalByProfile.get(p.profileId) ?? 0),
    splitWeight: adjustments[index],
  }))
}

/** Dispatch to the right split function and verify the invariant before returning. */
export function splitExpense(
  type: SplitType,
  total: Cents,
  participants: readonly SplitParticipantInput[]
): SplitShare[] {
  let shares: SplitShare[]

  switch (type) {
    case 'equal':
      shares = splitEqual(total, participants)
      break
    case 'exact':
      shares = splitByExactAmounts(total, participants)
      break
    case 'percent':
      shares = splitByPercent(total, participants)
      break
    case 'shares':
      shares = splitByShares(total, participants)
      break
    case 'adjustment':
      shares = splitByAdjustment(total, participants)
      break
    default: {
      const exhaustive: never = type
      throw new SplitError(`Unknown split type: ${String(exhaustive)}`)
    }
  }

  // Belt and braces: no split may leave or invent a cent.
  const sum = sumCents(shares.map((s) => s.owedCents))
  if (sum !== total) {
    throw new SplitError(
      `Split did not balance: shares total ${sum} but the expense is ${total}. This is a bug.`
    )
  }

  return shares
}
