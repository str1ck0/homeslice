import { describe, expect, it } from 'vitest'
import {
  SplitError,
  splitByAdjustment,
  splitByExactAmounts,
  splitByPercent,
  splitByShares,
  splitEqual,
  splitExpense,
} from '../split'
import { sumCents } from '../money'

const people = (...ids: string[]) => ids.map((profileId) => ({ profileId }))
const weighted = (entries: [string, number][]) =>
  entries.map(([profileId, weight]) => ({ profileId, weight }))
const owed = (shares: { owedCents: number }[]) => shares.map((s) => s.owedCents)

describe('splitEqual', () => {
  it('splits evenly when it divides cleanly', () => {
    const shares = splitEqual(3000, people('a', 'b', 'c'))
    expect(owed(shares)).toEqual([1000, 1000, 1000])
  })

  it('distributes the remainder one cent at a time to the lowest ids', () => {
    const shares = splitEqual(1000, people('a', 'b', 'c'))
    expect(owed(shares)).toEqual([334, 333, 333])
    expect(sumCents(owed(shares))).toBe(1000)
  })

  it('is deterministic regardless of the order people are passed in', () => {
    const forwards = splitEqual(1000, people('a', 'b', 'c'))
    const backwards = splitEqual(1000, people('c', 'b', 'a'))
    expect(forwards).toEqual(backwards)
  })

  it('handles a single person', () => {
    expect(owed(splitEqual(12345, people('a')))).toEqual([12345])
  })

  it('handles one cent among many people', () => {
    const shares = splitEqual(1, people('a', 'b', 'c', 'd', 'e', 'f', 'g'))
    expect(owed(shares)).toEqual([1, 0, 0, 0, 0, 0, 0])
    expect(sumCents(owed(shares))).toBe(1)
  })

  it('handles three cents among four people', () => {
    const shares = splitEqual(3, people('a', 'b', 'c', 'd'))
    expect(owed(shares)).toEqual([1, 1, 1, 0])
    expect(sumCents(owed(shares))).toBe(3)
  })

  it('handles a large group', () => {
    const group = people(...Array.from({ length: 20 }, (_, i) => `p${String(i).padStart(2, '0')}`))
    const shares = splitEqual(99999, group)
    expect(sumCents(owed(shares))).toBe(99999)
    // Nobody is more than one cent away from anybody else.
    expect(Math.max(...owed(shares)) - Math.min(...owed(shares))).toBe(1)
  })

  it('rejects an empty participant list', () => {
    expect(() => splitEqual(1000, [])).toThrow(SplitError)
  })

  it('rejects duplicate people', () => {
    expect(() => splitEqual(1000, people('a', 'a'))).toThrow(SplitError)
  })

  it('rejects fractional cents', () => {
    expect(() => splitEqual(10.5, people('a', 'b'))).toThrow()
  })
})

describe('splitByExactAmounts', () => {
  it('accepts amounts that sum to the total', () => {
    const shares = splitByExactAmounts(1000, weighted([['a', 700], ['b', 300]]))
    expect(owed(shares)).toEqual([700, 300])
  })

  it('preserves the entered amount as the stored weight', () => {
    const shares = splitByExactAmounts(1000, weighted([['a', 700], ['b', 300]]))
    expect(shares.map((s) => s.splitWeight)).toEqual([700, 300])
  })

  it('rejects amounts that fall short', () => {
    expect(() => splitByExactAmounts(1000, weighted([['a', 600], ['b', 300]]))).toThrow(
      /100 cents short/
    )
  })

  it('rejects amounts that overshoot', () => {
    expect(() => splitByExactAmounts(1000, weighted([['a', 800], ['b', 300]]))).toThrow(
      /100 cents over/
    )
  })
})

describe('splitByPercent', () => {
  it('splits by clean percentages', () => {
    const shares = splitByPercent(10000, weighted([['a', 50], ['b', 30], ['c', 20]]))
    expect(owed(shares)).toEqual([5000, 3000, 2000])
  })

  it('uses largest-remainder so thirds still sum exactly', () => {
    const shares = splitByPercent(1000, weighted([['a', 33.33], ['b', 33.33], ['c', 33.34]]))
    expect(sumCents(owed(shares))).toBe(1000)
  })

  it('gives the leftover cent to the largest fractional part', () => {
    // 100 cents at 33.33/33.33/33.34 -> 33.33, 33.33, 33.34 -> floors 33,33,33 = 99
    const shares = splitByPercent(100, weighted([['a', 33.33], ['b', 33.33], ['c', 33.34]]))
    expect(owed(shares)).toEqual([33, 33, 34])
  })

  it('rejects percentages that do not sum to 100', () => {
    expect(() => splitByPercent(1000, weighted([['a', 50], ['b', 40]]))).toThrow(/add up to 100/)
  })

  it('reports the actual total in the error', () => {
    expect(() => splitByPercent(1000, weighted([['a', 50], ['b', 40]]))).toThrow(/90%/)
  })

  it('allows a zero-percent participant', () => {
    const shares = splitByPercent(1000, weighted([['a', 100], ['b', 0]]))
    expect(owed(shares)).toEqual([1000, 0])
  })

  it('rejects negative percentages', () => {
    expect(() => splitByPercent(1000, weighted([['a', 110], ['b', -10]]))).toThrow(SplitError)
  })
})

describe('splitByShares', () => {
  it('splits by share counts', () => {
    const shares = splitByShares(4000, weighted([['a', 2], ['b', 1], ['c', 1]]))
    expect(owed(shares)).toEqual([2000, 1000, 1000])
  })

  it('sums exactly when shares do not divide evenly', () => {
    const shares = splitByShares(1000, weighted([['a', 1], ['b', 1], ['c', 1]]))
    expect(sumCents(owed(shares))).toBe(1000)
  })

  it('supports fractional shares', () => {
    const shares = splitByShares(3000, weighted([['a', 1.5], ['b', 1.5]]))
    expect(owed(shares)).toEqual([1500, 1500])
  })

  it('rejects an all-zero share list', () => {
    expect(() => splitByShares(1000, weighted([['a', 0], ['b', 0]]))).toThrow(SplitError)
  })
})

describe('splitByAdjustment', () => {
  it('applies the adjustment then splits the rest equally', () => {
    // R620 dinner, Sam had an R80 cocktail. The remaining R540 divides evenly
    // by three, so Sam's share is exactly R80 more than everyone else's.
    const shares = splitByAdjustment(62000, weighted([['a', 0], ['b', 0], ['sam', 8000]]))
    expect(sumCents(owed(shares))).toBe(62000)
    expect(owed(shares)).toEqual([18000, 18000, 26000])
  })

  it('absorbs an indivisible remainder into the equal portion', () => {
    // R600 less the R80 adjustment leaves R520, which does not divide by three.
    // The stray cent goes to the lowest profile id, so the gap between Sam and
    // the first participant reads 7999 rather than 8000 — expected, not a bug.
    const shares = splitByAdjustment(60000, weighted([['a', 0], ['b', 0], ['sam', 8000]]))
    expect(sumCents(owed(shares))).toBe(60000)
    expect(owed(shares)).toEqual([17334, 17333, 25333])

    const bySam = shares.find((s) => s.profileId === 'sam')!
    const byA = shares.find((s) => s.profileId === 'a')!
    expect(Math.abs(bySam.owedCents - byA.owedCents - 8000)).toBeLessThanOrEqual(1)
  })

  it('supports negative adjustments', () => {
    const shares = splitByAdjustment(3000, weighted([['a', -300], ['b', 0], ['c', 300]]))
    expect(sumCents(owed(shares))).toBe(3000)
    expect(owed(shares)).toEqual([700, 1000, 1300])
  })

  it('rejects adjustments larger than the total', () => {
    expect(() => splitByAdjustment(1000, weighted([['a', 2000], ['b', 0]]))).toThrow(
      /more than the total/
    )
  })
})

describe('splitExpense invariant', () => {
  const cases: [string, Parameters<typeof splitExpense>][] = [
    ['equal', ['equal', 100003, people('a', 'b', 'c', 'd', 'e', 'f', 'g')]],
    ['exact', ['exact', 999, weighted([['a', 333], ['b', 333], ['c', 333]])]],
    ['percent', ['percent', 100001, weighted([['a', 16.67], ['b', 33.33], ['c', 50]])]],
    ['shares', ['shares', 77777, weighted([['a', 3], ['b', 5], ['c', 7], ['d', 11]])]],
    ['adjustment', ['adjustment', 12345, weighted([['a', 111], ['b', 0], ['c', -11]])]],
  ]

  it.each(cases)('%s shares always sum to the total', (_name, args) => {
    const shares = splitExpense(...args)
    expect(sumCents(shares.map((s) => s.owedCents))).toBe(args[1])
  })

  it('never loses a cent across a sweep of awkward totals and group sizes', () => {
    for (let total = 1; total <= 200; total++) {
      for (let n = 1; n <= 9; n++) {
        const group = people(...Array.from({ length: n }, (_, i) => `p${i}`))
        const shares = splitExpense('equal', total, group)
        expect(sumCents(shares.map((s) => s.owedCents))).toBe(total)
      }
    }
  })

  it('rejects an unknown split type', () => {
    // @ts-expect-error deliberately invalid at runtime
    expect(() => splitExpense('sideways', 1000, people('a'))).toThrow(SplitError)
  })
})
