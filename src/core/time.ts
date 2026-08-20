/**
 * Dates said the way a person would say them.
 *
 * Nothing here touches `toLocaleDateString`. The runtime's locale data is not
 * the same under Node and in Chrome, and a string built one way on the server
 * and another in the browser is a hydration mismatch waiting to happen — the
 * same trap `formatCents` exists to avoid. So the month names are a literal
 * array and every string is assembled by hand.
 */

export const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "12 Aug", or "12 Aug 2025" once the year stops being the current one. */
export function formatDayMonth(date: Date, now: Date = new Date()): string {
  const stem = `${date.getDate()} ${MONTH_ABBR[date.getMonth()]}`
  return date.getFullYear() === now.getFullYear() ? stem : `${stem} ${date.getFullYear()}`
}

/**
 * How long ago something happened: "just now", "5 min ago", "yesterday",
 * "12 Aug" once it is far enough back that a count of days stops helping.
 *
 * A timestamp in the future reads as "just now" rather than a negative count.
 * Clocks disagree by a second or two all the time and that is not worth
 * showing anybody.
 */
export function formatRelativeTime(when: string | Date, now: Date = new Date()): string {
  const then = typeof when === 'string' ? new Date(when) : when
  if (Number.isNaN(then.getTime())) return ''

  const elapsed = now.getTime() - then.getTime()

  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE)
    return `${minutes} min ago`
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR)
    return hours === 1 ? 'an hour ago' : `${hours} hours ago`
  }

  const days = Math.floor(elapsed / DAY)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`

  return formatDayMonth(then, now)
}
