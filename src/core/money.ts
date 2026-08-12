/**
 * Integer-cent money arithmetic.
 *
 * Every monetary value in Homeslice is a whole number of minor units (cents).
 * Floating point is never used for money: `10.00 / 3` produces 3.333... and
 * three of those sum to 9.999..., silently losing a cent. All splitting
 * functions in `split.ts` return integer arrays that sum to exactly the total.
 */

/** A whole number of minor currency units (e.g. cents, pence). */
export type Cents = number

export class MoneyError extends Error {}

/** Currencies whose minor unit is the major unit — no decimal places. */
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX'])

/** Number of decimal places a currency is conventionally written with. */
export function decimalPlaces(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2
}

/** Minor units per major unit — 100 for USD/ZAR/EUR, 1 for JPY. */
export function minorUnitScale(currency: string): number {
  return decimalPlaces(currency) === 0 ? 1 : 100
}

export function assertValidCents(value: number, label = 'amount'): asserts value is Cents {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`${label} must be a finite number, got ${value}`)
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} must be a whole number of cents, got ${value}`)
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} is too large to represent exactly`)
  }
}

/**
 * Parse user input ("12.34", "1 234,56", "R12.34") into integer cents.
 * Throws rather than guessing when the input is not a clean number.
 */
export function parseAmountToCents(input: string, currency: string): Cents {
  const scale = minorUnitScale(currency)
  const cleaned = input
    .replace(/[^\d.,-]/g, '') // strip currency symbols and spaces
    .replace(/,(?=\d{3}\b)/g, '') // thousands separators: 1,234 -> 1234
    .replace(',', '.') // remaining comma is a decimal separator

  if (cleaned === '' || cleaned === '-' || cleaned === '.') {
    throw new MoneyError(`Could not read an amount from "${input}"`)
  }

  const value = Number(cleaned)
  if (!Number.isFinite(value)) {
    throw new MoneyError(`Could not read an amount from "${input}"`)
  }

  const places = decimalPlaces(currency)
  const decimals = cleaned.split('.')[1]
  if (decimals && decimals.length > places) {
    throw new MoneyError(
      places === 0
        ? `${currency} amounts cannot have decimal places`
        : `Amounts cannot be more precise than ${places} decimal places`
    )
  }

  // Round rather than truncate: 0.1 * 100 is 10.000000000000002 in binary float.
  const cents = Math.round(value * scale)
  assertValidCents(cents)
  return cents
}

/**
 * Symbols we are willing to print. Anything absent is shown as its code, which
 * is clearer than a glyph most people would not recognise — "AED 1,234.50"
 * reads better than "د.إ1,234.50", and nobody has to guess.
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  ZAR: 'R',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AUD: 'A$',
  CAD: 'C$',
  NZD: 'NZ$',
  JPY: '¥',
  INR: '₹',
}

/**
 * Format integer cents for display, e.g. 123456 -> "R1,234.56".
 *
 * Assembled by hand rather than through `toLocaleString`, because the runtime's
 * locale data is not the same everywhere: Node and Chrome disagree about what
 * `en-ZA` means, so the identical call produced "R1,234.50" on a server-rendered
 * page and "R 1 234,50" in a client component. Money that changes shape
 * depending on which side of the render it landed on is worse than money in a
 * format you did not pick — and it risks a hydration mismatch for anything
 * rendered both ways.
 *
 * Comma for thousands, full stop for decimals, symbol in front, everywhere.
 */
export function formatCents(
  cents: Cents,
  currency: string,
  options: { showSymbol?: boolean } = {}
): string {
  assertValidCents(cents)
  const { showSymbol = true } = options

  const code = currency.toUpperCase()
  const places = decimalPlaces(code)
  const scale = minorUnitScale(code)

  // Integer arithmetic throughout: dividing by 100 first would reintroduce the
  // float rounding this module exists to avoid.
  const negative = cents < 0
  const absolute = Math.abs(cents)
  const whole = Math.trunc(absolute / scale)
  const fraction = absolute - whole * scale

  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const digits =
    places === 0 ? grouped : `${grouped}.${String(fraction).padStart(places, '0')}`

  const sign = negative ? '-' : ''
  if (!showSymbol) return `${sign}${digits}`

  const symbol = CURRENCY_SYMBOLS[code]
  return symbol ? `${sign}${symbol}${digits}` : `${sign}${code} ${digits}`
}

/** Sum a list of cent amounts, validating each. */
export function sumCents(amounts: readonly Cents[]): Cents {
  let total = 0
  for (const amount of amounts) {
    assertValidCents(amount)
    total += amount
  }
  assertValidCents(total, 'total')
  return total
}

export function absCents(amount: Cents): Cents {
  assertValidCents(amount)
  return Math.abs(amount)
}

/** True when the amount is within `tolerance` cents of zero. */
export function isZero(amount: Cents, tolerance: Cents = 0): boolean {
  return Math.abs(amount) <= tolerance
}
