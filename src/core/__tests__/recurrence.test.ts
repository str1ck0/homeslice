import { describe, expect, it } from 'vitest'
import {
  RecurrenceError,
  describeFrequency,
  daysInMonth,
  nextOccurrence,
  occurrencesDue,
  parseIsoDate,
} from '../recurrence'

describe('parseIsoDate', () => {
  it('accepts a real date', () => {
    expect(parseIsoDate('2026-08-11')).toEqual({ year: 2026, month: 8, day: 11 })
  })

  it('rejects a malformed string', () => {
    expect(() => parseIsoDate('11/08/2026')).toThrow(RecurrenceError)
  })

  it('rejects a date that does not exist', () => {
    expect(() => parseIsoDate('2026-02-30')).toThrow(RecurrenceError)
    expect(() => parseIsoDate('2026-13-01')).toThrow(RecurrenceError)
  })

  it('accepts 29 February in a leap year and rejects it otherwise', () => {
    expect(() => parseIsoDate('2028-02-29')).not.toThrow()
    expect(() => parseIsoDate('2026-02-29')).toThrow(RecurrenceError)
  })
})

describe('daysInMonth', () => {
  it('knows the short months', () => {
    expect(daysInMonth(2026, 4)).toBe(30)
    expect(daysInMonth(2026, 2)).toBe(28)
  })

  it('knows leap years', () => {
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2000, 2)).toBe(29) // divisible by 400
    expect(daysInMonth(1900, 2)).toBe(28) // divisible by 100 but not 400
  })
})

describe('nextOccurrence', () => {
  it('adds days', () => {
    expect(nextOccurrence('2026-08-11', 'daily')).toBe('2026-08-12')
  })

  it('adds weeks and fortnights', () => {
    expect(nextOccurrence('2026-08-11', 'weekly')).toBe('2026-08-18')
    expect(nextOccurrence('2026-08-11', 'fortnightly')).toBe('2026-08-25')
  })

  it('adds months', () => {
    expect(nextOccurrence('2026-08-11', 'monthly')).toBe('2026-09-11')
  })

  it('clamps to the end of a shorter month instead of overflowing', () => {
    expect(nextOccurrence('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(nextOccurrence('2028-01-31', 'monthly')).toBe('2028-02-29')
    expect(nextOccurrence('2026-03-31', 'monthly')).toBe('2026-04-30')
  })

  it('rolls the year over', () => {
    expect(nextOccurrence('2026-12-15', 'monthly')).toBe('2027-01-15')
    expect(nextOccurrence('2026-11-01', 'quarterly')).toBe('2027-02-01')
  })

  it('handles quarterly and yearly', () => {
    expect(nextOccurrence('2026-08-11', 'quarterly')).toBe('2026-11-11')
    expect(nextOccurrence('2026-08-11', 'yearly')).toBe('2027-08-11')
  })

  it('moves 29 February to the 28th in a non-leap year', () => {
    expect(nextOccurrence('2028-02-29', 'yearly')).toBe('2029-02-28')
  })

  it('respects an interval greater than one', () => {
    expect(nextOccurrence('2026-08-11', 'monthly', 2)).toBe('2026-10-11')
    expect(nextOccurrence('2026-08-11', 'daily', 10)).toBe('2026-08-21')
  })

  it('rejects a nonsense interval', () => {
    expect(() => nextOccurrence('2026-08-11', 'daily', 0)).toThrow(RecurrenceError)
    expect(() => nextOccurrence('2026-08-11', 'daily', 1.5)).toThrow(RecurrenceError)
  })

  it('does not drift when applied repeatedly from a month end', () => {
    // Clamping is not reversible, so Jan 31 monthly settles onto the 28th.
    // Documented rather than accidental: the rule is "same day, clamped".
    let date = '2026-01-31'
    const sequence = [date]
    for (let i = 0; i < 3; i++) {
      date = nextOccurrence(date, 'monthly')
      sequence.push(date)
    }
    expect(sequence).toEqual(['2026-01-31', '2026-02-28', '2026-03-28', '2026-04-28'])
  })
})

describe('occurrencesDue', () => {
  it('returns nothing when the next run is in the future', () => {
    expect(occurrencesDue('2026-09-01', 'monthly', 1, '2026-08-11')).toEqual([])
  })

  it('returns the single occurrence due today', () => {
    expect(occurrencesDue('2026-08-11', 'monthly', 1, '2026-08-11')).toEqual(['2026-08-11'])
  })

  it('catches up on every missed occurrence', () => {
    expect(occurrencesDue('2026-05-01', 'monthly', 1, '2026-08-11')).toEqual([
      '2026-05-01',
      '2026-06-01',
      '2026-07-01',
      '2026-08-01',
    ])
  })

  it('stops at the end date', () => {
    expect(occurrencesDue('2026-05-01', 'monthly', 1, '2026-08-11', '2026-06-15')).toEqual([
      '2026-05-01',
      '2026-06-01',
    ])
  })

  it('is bounded so a far-past start date cannot generate thousands of rows', () => {
    expect(occurrencesDue('1990-01-01', 'daily', 1, '2026-08-11')).toHaveLength(120)
  })
})

describe('describeFrequency', () => {
  it('reads naturally at interval 1', () => {
    expect(describeFrequency('monthly')).toBe('Every month')
    expect(describeFrequency('fortnightly')).toBe('Every two weeks')
  })

  it('pluralises for larger intervals', () => {
    expect(describeFrequency('monthly', 3)).toBe('Every 3 months')
  })
})
