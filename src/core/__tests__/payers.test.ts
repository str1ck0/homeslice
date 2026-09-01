import { describe, expect, it } from 'vitest'
import {
  PayerError,
  confinePayers,
  payerRemainder,
  resolvePayers,
  solePayer,
  togglePayer,
} from '../payers'

describe('solePayer', () => {
  it('names the only payer', () => {
    expect(solePayer({ a: '' })).toBe('a')
  })

  it('is null for none or several', () => {
    expect(solePayer({})).toBeNull()
    expect(solePayer({ a: '10', b: '20' })).toBeNull()
  })
})

describe('togglePayer', () => {
  it('adds a payer with an empty amount', () => {
    expect(togglePayer({ a: '' }, 'b')).toEqual({ a: '', b: '' })
  })

  it('removes a payer', () => {
    expect(togglePayer({ a: '10', b: '20' }, 'b')).toEqual({ a: '10' })
  })

  it('refuses to remove the last payer', () => {
    const payers = { a: '10' }
    expect(togglePayer(payers, 'a')).toBe(payers)
  })

  it('leaves the amounts of everyone else alone', () => {
    expect(togglePayer({ a: '10', b: '20' }, 'c')).toEqual({ a: '10', b: '20', c: '' })
  })
})

describe('confinePayers', () => {
  it('drops payers who are no longer in the expense', () => {
    expect(confinePayers({ a: '10', b: '20' }, ['a'])).toEqual({ a: '10' })
  })

  it('returns an empty set when nobody survives, rather than inventing a payer', () => {
    expect(confinePayers({ a: '10' }, ['b', 'c'])).toEqual({})
  })
})

describe('resolvePayers', () => {
  it('gives a single payer the whole total, ignoring whatever is in the box', () => {
    expect(resolvePayers({ a: 'nonsense' }, 5000, 'ZAR')).toEqual([
      { profileId: 'a', amountCents: 5000 },
    ])
  })

  it('parses several payers that add up', () => {
    expect(resolvePayers({ a: '400', b: '200' }, 60000, 'ZAR')).toEqual([
      { profileId: 'a', amountCents: 40000 },
      { profileId: 'b', amountCents: 20000 },
    ])
  })

  it('rejects payments that fall short', () => {
    expect(() => resolvePayers({ a: '400', b: '100' }, 60000, 'ZAR')).toThrow(PayerError)
    expect(() => resolvePayers({ a: '400', b: '100' }, 60000, 'ZAR')).toThrow(
      'R100.00 of the total is unaccounted for'
    )
  })

  it('rejects payments that overshoot', () => {
    expect(() => resolvePayers({ a: '400', b: '400' }, 60000, 'ZAR')).toThrow(
      'over the total by R200.00'
    )
  })

  it('rejects a blank amount', () => {
    expect(() => resolvePayers({ a: '400', b: '  ' }, 60000, 'ZAR')).toThrow(
      'Enter what each person paid'
    )
  })

  it('rejects a payer who put in nothing', () => {
    expect(() => resolvePayers({ a: '600', b: '0' }, 60000, 'ZAR')).toThrow(
      'more than nothing'
    )
  })

  it('rejects an empty payer set', () => {
    expect(() => resolvePayers({}, 60000, 'ZAR')).toThrow('Say who paid')
  })

  it('is exact to the cent — the sum is checked in integers, not floats', () => {
    // 0.1 + 0.2 !== 0.3 in floating point; in cents it is 10 + 20 === 30.
    expect(resolvePayers({ a: '0.10', b: '0.20' }, 30, 'ZAR')).toEqual([
      { profileId: 'a', amountCents: 10 },
      { profileId: 'b', amountCents: 20 },
    ])
  })

  it('handles a currency with no minor unit', () => {
    expect(resolvePayers({ a: '400', b: '600' }, 1000, 'JPY')).toEqual([
      { profileId: 'a', amountCents: 400 },
      { profileId: 'b', amountCents: 600 },
    ])
  })
})

describe('payerRemainder', () => {
  it('is null while there is only one payer to speak of', () => {
    expect(payerRemainder({ a: '' }, 60000, 'ZAR')).toBeNull()
  })

  it('is null before an amount has been typed', () => {
    expect(payerRemainder({ a: '', b: '' }, null, 'ZAR')).toBeNull()
  })

  it('reports what is still unassigned', () => {
    expect(payerRemainder({ a: '400', b: '' }, 60000, 'ZAR')).toBe(20000)
  })

  it('goes negative once the payments overshoot', () => {
    expect(payerRemainder({ a: '400', b: '400' }, 60000, 'ZAR')).toBe(-20000)
  })

  it('treats a half-typed amount as nothing rather than voiding the line', () => {
    expect(payerRemainder({ a: '400', b: '-' }, 60000, 'ZAR')).toBe(20000)
  })
})
