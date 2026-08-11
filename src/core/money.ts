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

/** Format integer cents for display, e.g. 123456 -> "R1,234.56". */
export function formatCents(
  cents: Cents,
  currency: string,
  options: { showSymbol?: boolean; locale?: string } = {}
): string {
  assertValidCents(cents)
  const { showSymbol = true, locale = 'en-ZA' } = options
  const places = decimalPlaces(currency)
  const value = cents / minorUnitScale(currency)

  if (!showSymbol) {
    return value.toLocaleString(locale, {
      minimumFractionDigits: places,
      maximumFractionDigits: places,
    })
  }

  try {
    return value.toLocaleString(locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: places,
      maximumFractionDigits: places,
    })
  } catch {
    // Unknown currency code — fall back to a plain number with the code appended.
    const formatted = value.toLocaleString(locale, {
      minimumFractionDigits: places,
      maximumFractionDigits: places,
    })
    return `${currency.toUpperCase()} ${formatted}`
  }
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
