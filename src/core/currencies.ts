/** Currencies offered in pickers. Not a constraint on what the database stores. */
export const CURRENCY_CODES = [
  'ZAR',
  'USD',
  'EUR',
  'GBP',
  'AUD',
  'CAD',
  'NZD',
  'JPY',
  'INR',
  'CHF',
  'SEK',
  'AED',
] as const

export type CurrencyCode = (typeof CURRENCY_CODES)[number]
