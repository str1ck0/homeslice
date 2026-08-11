/**
 * Recurring expense scheduling.
 *
 * Dates here are calendar dates ("2026-08-11"), never timestamps. Rent is due
 * on the 1st regardless of what timezone anyone happens to be in, and using
 * Date objects for this is how you end up generating an expense on the 31st
 * for someone in Auckland and the 1st for someone in Cape Town.
 */

export const FREQUENCIES = [
  'daily',
  'weekly',
  'fortnightly',
  'monthly',
  'quarterly',
  'yearly',
] as const

export type Frequency = (typeof FREQUENCIES)[number]

export class RecurrenceError extends Error {}

/** A calendar date in ISO form, e.g. "2026-08-11". */
export type IsoDate = string

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

interface DateParts {
  year: number
  month: number // 1-12
  day: number // 1-31
}

export function parseIsoDate(date: IsoDate): DateParts {
  if (!ISO_DATE.test(date)) {
    throw new RecurrenceError(`Expected a date like 2026-08-11, got "${date}"`)
  }
  const [year, month, day] = date.split('-').map(Number)
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RecurrenceError(`"${date}" is not a real date`)
  }
  return { year, month, day }
}

export function formatIsoDate({ year, month, day }: DateParts): IsoDate {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function addDays(date: IsoDate, days: number): IsoDate {
  const { year, month, day } = parseIsoDate(date)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return formatIsoDate({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  })
}

/**
 * Add months, clamping to the end of the target month.
 * 2026-01-31 + 1 month is 2026-02-28, not 2026-03-03.
 */
function addMonths(date: IsoDate, months: number): IsoDate {
  const { year, month, day } = parseIsoDate(date)
  const zeroBased = month - 1 + months
  const targetYear = year + Math.floor(zeroBased / 12)
  const targetMonth = ((zeroBased % 12) + 12) % 12 + 1
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth))
  return formatIsoDate({ year: targetYear, month: targetMonth, day: clampedDay })
}

/** The next date after `from` for a given frequency. */
export function nextOccurrence(from: IsoDate, frequency: Frequency, interval = 1): IsoDate {
  if (!Number.isInteger(interval) || interval < 1) {
    throw new RecurrenceError('Interval must be a whole number of 1 or more')
  }

  switch (frequency) {
    case 'daily':
      return addDays(from, interval)
    case 'weekly':
      return addDays(from, 7 * interval)
    case 'fortnightly':
      return addDays(from, 14 * interval)
    case 'monthly':
      return addMonths(from, interval)
    case 'quarterly':
      return addMonths(from, 3 * interval)
    case 'yearly':
      return addMonths(from, 12 * interval)
    default: {
      const exhaustive: never = frequency
      throw new RecurrenceError(`Unknown frequency: ${String(exhaustive)}`)
    }
  }
}

export function compareIsoDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Every occurrence due on or before `until` that hasn't run yet.
 *
 * The cron job uses this to catch up: if the app was down for a week, or a
 * rule was created with a start date in the past, this returns all the missed
 * dates rather than silently skipping to the next one.
 */
export function occurrencesDue(
  nextRunOn: IsoDate,
  frequency: Frequency,
  interval: number,
  until: IsoDate,
  endOn: IsoDate | null = null,
  maxOccurrences = 120
): IsoDate[] {
  const due: IsoDate[] = []
  let cursor = nextRunOn

  while (compareIsoDates(cursor, until) <= 0) {
    if (endOn && compareIsoDates(cursor, endOn) > 0) break
    due.push(cursor)
    if (due.length >= maxOccurrences) break
    cursor = nextOccurrence(cursor, frequency, interval)
  }

  return due
}

export function describeFrequency(frequency: Frequency, interval = 1): string {
  if (interval === 1) {
    return {
      daily: 'Every day',
      weekly: 'Every week',
      fortnightly: 'Every two weeks',
      monthly: 'Every month',
      quarterly: 'Every three months',
      yearly: 'Every year',
    }[frequency]
  }

  const unit = {
    daily: 'days',
    weekly: 'weeks',
    fortnightly: 'fortnights',
    monthly: 'months',
    quarterly: 'quarters',
    yearly: 'years',
  }[frequency]

  return `Every ${interval} ${unit}`
}
