import { describe, expect, it } from 'vitest'
import { formatDayMonth, formatRelativeTime } from '../time'

const now = new Date('2026-08-20T12:00:00Z')

describe('formatRelativeTime', () => {
  it('calls the last minute "just now"', () => {
    expect(formatRelativeTime('2026-08-20T12:00:00Z', now)).toBe('just now')
    expect(formatRelativeTime('2026-08-20T11:59:01Z', now)).toBe('just now')
  })

  it('reads a clock running fast as "just now" rather than a negative count', () => {
    expect(formatRelativeTime('2026-08-20T12:00:05Z', now)).toBe('just now')
  })

  it('counts minutes, then hours', () => {
    expect(formatRelativeTime('2026-08-20T11:58:00Z', now)).toBe('2 min ago')
    expect(formatRelativeTime('2026-08-20T11:01:00Z', now)).toBe('59 min ago')
    expect(formatRelativeTime('2026-08-20T11:00:00Z', now)).toBe('an hour ago')
    expect(formatRelativeTime('2026-08-20T07:00:00Z', now)).toBe('5 hours ago')
  })

  it('says yesterday, then days, then a date', () => {
    expect(formatRelativeTime('2026-08-19T11:00:00Z', now)).toBe('yesterday')
    expect(formatRelativeTime('2026-08-17T12:00:00Z', now)).toBe('3 days ago')
    expect(formatRelativeTime('2026-08-13T11:00:00Z', now)).toBe('13 Aug')
  })

  it('shows the year once it is not this one', () => {
    expect(formatRelativeTime('2025-12-24T11:00:00Z', now)).toBe('24 Dec 2025')
  })

  it('returns an empty string for an unreadable timestamp', () => {
    expect(formatRelativeTime('not a date', now)).toBe('')
  })
})

describe('formatDayMonth', () => {
  it('never uses toLocaleDateString, so server and browser agree', () => {
    expect(formatDayMonth(new Date('2026-01-05T00:00:00'), now)).toBe('5 Jan')
    expect(formatDayMonth(new Date('2024-11-30T00:00:00'), now)).toBe('30 Nov 2024')
  })
})
