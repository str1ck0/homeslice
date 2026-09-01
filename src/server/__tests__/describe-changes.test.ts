import { describe, expect, it } from 'vitest'
import { describeChanges } from '../services/expenses'
import type { ExpenseDetail } from '../services/expenses'
import type { ExpenseInput } from '../services/expenses'

/**
 * The append-only record is only worth having if it describes every edit that
 * moves money. These pin the cases where it nearly didn't.
 */

const person = (profileId: string, displayName: string, paidCents: number, owedCents: number) => ({
  profileId,
  displayName,
  avatarUrl: null,
  paidCents,
  owedCents,
})

/** Devin paid €80, Ada €40, split €40 each. */
const before: ExpenseDetail = {
  id: 'e1',
  groupId: 'g1',
  description: 'Dinner at Ramiro',
  amountCents: 12000,
  currency: 'EUR',
  expenseDate: '2026-08-24',
  splitType: 'exact',
  note: null,
  categoryName: null,
  createdBy: 'devin',
  createdByName: 'Devin',
  deletedAt: null,
  participants: [
    person('devin', 'Devin', 8000, 4000),
    person('ada', 'Ada', 4000, 4000),
    person('bo', 'Bo', 0, 4000),
  ],
  imageIds: [],
}

const input = (payers: { profileId: string; amountCents: number }[]): ExpenseInput => ({
  groupId: 'g1',
  description: 'Dinner at Ramiro',
  amount: '120.00',
  currency: 'EUR',
  expenseDate: '2026-08-24',
  splitType: 'exact',
  categoryId: null,
  note: null,
  payers,
  participants: [
    { profileId: 'devin', weight: 4000 },
    { profileId: 'ada', weight: 4000 },
    { profileId: 'bo', weight: 4000 },
  ],
})

const unchanged = [
  { profileId: 'devin', amountCents: 8000 },
  { profileId: 'ada', amountCents: 4000 },
]

describe('describeChanges — who paid', () => {
  it('says nothing when nothing changed', () => {
    expect(describeChanges(before, input(unchanged), 12000)).toEqual([])
  })

  it('records a change to what each payer put in, even when the payers are the same people', () => {
    // The case that went unrecorded: same two payers, different amounts, and
    // every balance on the expense moves.
    const lines = describeChanges(
      before,
      input([
        { profileId: 'devin', amountCents: 7000 },
        { profileId: 'ada', amountCents: 5000 },
      ]),
      12000
    )

    expect(lines).toHaveLength(1)
    expect(lines[0]).toBe(
      'What each person paid changed: Devin €80.00 → €70.00, Ada €40.00 → €50.00'
    )
  })

  it('names only the payers who actually moved', () => {
    const lines = describeChanges(
      before,
      input([
        { profileId: 'devin', amountCents: 8000 },
        { profileId: 'ada', amountCents: 4000 },
      ]),
      12000
    )
    expect(lines).toEqual([])
  })

  it('falls back to the plain sentence when the set of payers changes', () => {
    const lines = describeChanges(before, input([{ profileId: 'bo', amountCents: 12000 }]), 12000)
    expect(lines).toContain('Who paid changed')
  })

  it('notices a single payer being replaced by two', () => {
    const single: ExpenseDetail = {
      ...before,
      participants: [
        person('devin', 'Devin', 12000, 4000),
        person('ada', 'Ada', 0, 4000),
        person('bo', 'Bo', 0, 4000),
      ],
    }
    expect(describeChanges(single, input(unchanged), 12000)).toContain('Who paid changed')
  })

  it('still reports an amount change alongside a payer change', () => {
    const lines = describeChanges(
      before,
      {
        ...input([
          { profileId: 'devin', amountCents: 9000 },
          { profileId: 'ada', amountCents: 5000 },
        ]),
        amount: '140.00',
      },
      14000
    )
    expect(lines.some((l) => l.includes('Amount changed from €120.00 to €140.00'))).toBe(true)
    expect(lines.some((l) => l.startsWith('What each person paid changed'))).toBe(true)
  })
})
