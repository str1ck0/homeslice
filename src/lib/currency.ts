export type CurrencyCode = 'USD' | 'ZAR' | 'EUR' | 'GBP' | 'AUD' | 'CAD' | 'JPY' | 'INR'

export const CURRENCIES: Record<CurrencyCode, { symbol: string; name: string }> = {
  USD: { symbol: '$', name: 'US Dollar' },
  ZAR: { symbol: 'R', name: 'South African Rand' },
  EUR: { symbol: '€', name: 'Euro' },
  GBP: { symbol: '£', name: 'British Pound' },
  AUD: { symbol: 'A$', name: 'Australian Dollar' },
  CAD: { symbol: 'C$', name: 'Canadian Dollar' },
  JPY: { symbol: '¥', name: 'Japanese Yen' },
  INR: { symbol: '₹', name: 'Indian Rupee' },
}

export function getCurrencySymbol(code: string): string {
  return CURRENCIES[code as CurrencyCode]?.symbol || code
}

export function formatCurrency(amount: number, currencyCode: string): string {
  const symbol = getCurrencySymbol(currencyCode)
  return `${symbol}${amount.toFixed(2)}`
}
