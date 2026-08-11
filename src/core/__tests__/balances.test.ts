import { describe, expect, it } from 'vitest'
import {
  type ExpenseRecord,
  type SettlementRecord,
  balanceForProfile,
  calculateNetBalances,
  calculatePairwiseDebts,
  debtsBetween,
} from '../balances'
import { simplifyDebts } from '../simplify'
import { splitExpense } from '../split'

/** Alice pays the whole bill, split equally between everyone listed. */
function expensePaidBy(
  id: string,
  payer: string,
  total: number,
  participants: string[],
  currency = 'ZAR'
): ExpenseRecord {
  const shares = splitExpense('equal', total, participants.map((profileId) => ({ profileId })))
  return {
    id,
    currency,
    participants: shares.map((s) => ({
      profileId: s.profileId,
      paidCents: s.profileId === payer ? total : 0,
      owedCents: s.owedCents,
    })),
  }
}

const net = (balances: ReturnType<typeof calculateNetBalances>, currency = 'ZAR') =>
  Object.fromEntries(balances.get(currency) ?? new Map())

describe('calculateNetBalances', () => {
  it('credits the payer and debits everyone else', () => {
    const balances = calculateNetBalances([expensePaidBy('e1', 'alice', 3000, ['alice', 'bob', 'carol'])])
    expect(net(balances)).toEqual({ alice: 2000, bob: -1000, carol: -1000 })
  })

  it('always sums to zero within a currency', () => {
    const balances = calculateNetBalances([
      expensePaidBy('e1', 'alice', 1000, ['alice', 'bob', 'carol']),
      expensePaidBy('e2', 'bob', 7777, ['alice', 'bob']),
      expensePaidBy('e3', 'carol', 33, ['alice', 'bob', 'carol', 'dave']),
    ])
    const total = [...(balances.get('ZAR') ?? new Map()).values()].reduce((a, b) => a + b, 0)
    expect(total).toBe(0)
  })

  it('keeps currencies entirely separate', () => {
    const balances = calculateNetBalances([
      expensePaidBy('e1', 'alice', 3000, ['alice', 'bob'], 'ZAR'),
      expensePaidBy('e2', 'bob', 5000, ['alice', 'bob'], 'EUR'),
    ])
    expect(net(balances, 'ZAR')).toEqual({ alice: 1500, bob: -1500 })
    expect(net(balances, 'EUR')).toEqual({ alice: -2500, bob: 2500 })
  })

  it('handles an expense with multiple payers', () => {
    const expense: ExpenseRecord = {
      id: 'e1',
      currency: 'ZAR',
      participants: [
        { profileId: 'alice', paidCents: 4000, owedCents: 2000 },
        { profileId: 'bob', paidCents: 2000, owedCents: 2000 },
        { profileId: 'carol', paidCents: 0, owedCents: 2000 },
      ],
    }
    expect(net(calculateNetBalances([expense]))).toEqual({ alice: 2000, carol: -2000 })
  })

  it('settling in full returns everyone to zero', () => {
    const expenses = [expensePaidBy('e1', 'alice', 3000, ['alice', 'bob', 'carol'])]
    const settlements: SettlementRecord[] = [
      { id: 's1', currency: 'ZAR', fromProfileId: 'bob', toProfileId: 'alice', amountCents: 1000 },
      { id: 's2', currency: 'ZAR', fromProfileId: 'carol', toProfileId: 'alice', amountCents: 1000 },
    ]
    expect(net(calculateNetBalances(expenses, settlements))).toEqual({})
  })

  it('omits people who net out to exactly zero', () => {
    const expense: ExpenseRecord = {
      id: 'e1',
      currency: 'ZAR',
      participants: [
        { profileId: 'alice', paidCents: 1000, owedCents: 1000 },
        { profileId: 'bob', paidCents: 1000, owedCents: 1000 },
      ],
    }
    expect(net(calculateNetBalances([expense]))).toEqual({})
  })
})

describe('calculatePairwiseDebts', () => {
  it('points each debtor at the person who paid', () => {
    const edges = calculatePairwiseDebts([
      expensePaidBy('e1', 'alice', 3000, ['alice', 'bob', 'carol']),
    ])
    expect(edges).toEqual([
      { fromProfileId: 'bob', toProfileId: 'alice', currency: 'ZAR', amountCents: 1000 },
      { fromProfileId: 'carol', toProfileId: 'alice', currency: 'ZAR', amountCents: 1000 },
    ])
  })

  it('nets opposing debts between the same pair', () => {
    const edges = calculatePairwiseDebts([
      expensePaidBy('e1', 'alice', 1000, ['alice', 'bob']), // bob owes alice 500
      expensePaidBy('e2', 'bob', 600, ['alice', 'bob']), // alice owes bob 300
    ])
    expect(edges).toEqual([
      { fromProfileId: 'bob', toProfileId: 'alice', currency: 'ZAR', amountCents: 200 },
    ])
  })

  it('does not net across unrelated pairs', () => {
    // Alice -> Bob and Bob -> Carol stay as two separate debts without simplification.
    const edges = calculatePairwiseDebts([
      expensePaidBy('e1', 'alice', 200, ['alice', 'bob']),
      expensePaidBy('e2', 'bob', 200, ['bob', 'carol']),
    ])
    expect(edges).toHaveLength(2)
  })

  it('cancels a debt exactly when it is settled', () => {
    const edges = calculatePairwiseDebts(
      [expensePaidBy('e1', 'alice', 1000, ['alice', 'bob'])],
      [{ id: 's1', currency: 'ZAR', fromProfileId: 'bob', toProfileId: 'alice', amountCents: 500 }]
    )
    expect(edges).toEqual([])
  })

  it('agrees with the net balances for every person', () => {
    const expenses = [
      expensePaidBy('e1', 'alice', 1000, ['alice', 'bob', 'carol']),
      expensePaidBy('e2', 'bob', 7777, ['alice', 'bob']),
      expensePaidBy('e3', 'carol', 33, ['alice', 'bob', 'carol', 'dave']),
    ]
    const balances = calculateNetBalances(expenses)
    const edges = calculatePairwiseDebts(expenses)

    for (const person of ['alice', 'bob', 'carol', 'dave']) {
      const fromEdges = edges
        .filter((e) => e.fromProfileId === person)
        .reduce((sum, e) => sum + e.amountCents, 0)
      const toEdges = edges
        .filter((e) => e.toProfileId === person)
        .reduce((sum, e) => sum + e.amountCents, 0)
      const expected = balances.get('ZAR')?.get(person) ?? 0
      expect(toEdges - fromEdges).toBe(expected)
    }
  })

  it('finds the debts between two specific people', () => {
    const edges = calculatePairwiseDebts([
      expensePaidBy('e1', 'alice', 3000, ['alice', 'bob', 'carol']),
    ])
    expect(debtsBetween(edges, 'alice', 'bob')).toHaveLength(1)
    expect(debtsBetween(edges, 'bob', 'carol')).toHaveLength(0)
  })
})

describe('balanceForProfile', () => {
  it('returns one entry per currency the person is not square in', () => {
    const balances = calculateNetBalances([
      expensePaidBy('e1', 'alice', 3000, ['alice', 'bob'], 'ZAR'),
      expensePaidBy('e2', 'alice', 5000, ['alice', 'bob'], 'EUR'),
    ])
    expect(Object.fromEntries(balanceForProfile(balances, 'alice'))).toEqual({
      ZAR: 1500,
      EUR: 2500,
    })
  })
})

describe('simplifyDebts', () => {
  it('collapses a chain into a single payment', () => {
    // Alice owes Bob 100, Bob owes Carol 100 -> Alice pays Carol 100.
    const balances = new Map([
      ['ZAR', new Map([['alice', -10000], ['bob', 0], ['carol', 10000]])],
    ])
    expect(simplifyDebts(balances)).toEqual([
      { fromProfileId: 'alice', toProfileId: 'carol', currency: 'ZAR', amountCents: 10000 },
    ])
  })

  it('leaves every net position unchanged', () => {
    const expenses = [
      expensePaidBy('e1', 'alice', 1000, ['alice', 'bob', 'carol']),
      expensePaidBy('e2', 'bob', 7777, ['alice', 'bob', 'dave']),
      expensePaidBy('e3', 'carol', 4321, ['alice', 'bob', 'carol', 'dave']),
    ]
    const balances = calculateNetBalances(expenses)
    const plan = simplifyDebts(balances)

    for (const person of ['alice', 'bob', 'carol', 'dave']) {
      const paid = plan
        .filter((e) => e.fromProfileId === person)
        .reduce((sum, e) => sum + e.amountCents, 0)
      const received = plan
        .filter((e) => e.toProfileId === person)
        .reduce((sum, e) => sum + e.amountCents, 0)
      expect(received - paid).toBe(balances.get('ZAR')?.get(person) ?? 0)
    }
  })

  it('never needs more payments than there are people, minus one', () => {
    const expenses = Array.from({ length: 12 }, (_, i) =>
      expensePaidBy(`e${i}`, `p${i % 5}`, 1000 + i * 137, ['p0', 'p1', 'p2', 'p3', 'p4'])
    )
    const balances = calculateNetBalances(expenses)
    const involved = balances.get('ZAR')?.size ?? 0
    expect(simplifyDebts(balances).length).toBeLessThanOrEqual(Math.max(involved - 1, 0))
  })

  it('returns nothing when everyone is already square', () => {
    expect(simplifyDebts(calculateNetBalances([]))).toEqual([])
  })

  it('simplifies each currency independently', () => {
    const balances = new Map([
      ['ZAR', new Map([['alice', 1000], ['bob', -1000]])],
      ['EUR', new Map([['alice', -500], ['bob', 500]])],
    ])
    const plan = simplifyDebts(balances)
    expect(plan).toHaveLength(2)
    expect(new Set(plan.map((e) => e.currency))).toEqual(new Set(['ZAR', 'EUR']))
  })
})
