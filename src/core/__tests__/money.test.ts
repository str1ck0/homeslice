import { describe, expect, it } from 'vitest'
import {
  MoneyError,
  decimalPlaces,
  formatCents,
  isZero,
  parseAmountToCents,
  sumCents,
} from '../money'

describe('parseAmountToCents', () => {
  it('parses a plain decimal', () => {
    expect(parseAmountToCents('12.34', 'ZAR')).toBe(1234)
  })

  it('parses a whole number', () => {
    expect(parseAmountToCents('12', 'ZAR')).toBe(1200)
  })

  it('handles the classic binary-float trap', () => {
    // 0.1 * 100 is 10.000000000000002 in IEEE 754; truncating would give 10 -> fine,
    // but 1.15 * 100 is 114.99999999999999 and truncating gives 114. Rounding is correct.
    expect(parseAmountToCents('1.15', 'ZAR')).toBe(115)
    expect(parseAmountToCents('0.29', 'ZAR')).toBe(29)
    expect(parseAmountToCents('8.16', 'ZAR')).toBe(816)
  })

  it('strips currency symbols and spaces', () => {
    expect(parseAmountToCents('R 1 234.56', 'ZAR')).toBe(123456)
    expect(parseAmountToCents('$99.99', 'USD')).toBe(9999)
  })

  it('handles thousands separators', () => {
    expect(parseAmountToCents('1,234.56', 'ZAR')).toBe(123456)
  })

  it('treats a lone comma as a decimal separator', () => {
    expect(parseAmountToCents('12,34', 'EUR')).toBe(1234)
  })

  it('rejects more precision than the currency has', () => {
    expect(() => parseAmountToCents('12.345', 'ZAR')).toThrow(MoneyError)
  })

  it('rejects decimals for zero-decimal currencies', () => {
    expect(() => parseAmountToCents('1200.5', 'JPY')).toThrow(/cannot have decimal places/)
  })

  it('treats yen as its own minor unit', () => {
    expect(parseAmountToCents('1200', 'JPY')).toBe(1200)
  })

  it('rejects gibberish', () => {
    expect(() => parseAmountToCents('abc', 'ZAR')).toThrow(MoneyError)
    expect(() => parseAmountToCents('', 'ZAR')).toThrow(MoneyError)
  })
})

describe('decimalPlaces', () => {
  it('is 2 for ordinary currencies', () => {
    expect(decimalPlaces('ZAR')).toBe(2)
    expect(decimalPlaces('usd')).toBe(2)
  })

  it('is 0 for yen', () => {
    expect(decimalPlaces('JPY')).toBe(0)
  })
})

describe('formatCents', () => {
  /**
   * These assert the exact string on purpose. The previous versions checked
   * only that the output contained "234", which is what let the format drift:
   * `toLocaleString('en-ZA')` renders "R1,234.50" under Node and "R 1 234,50"
   * in Chrome, so the same expense looked different on a server-rendered page
   * and in a client component, and no test noticed.
   */
  it('puts the symbol in front, commas between thousands, a full stop before cents', () => {
    expect(formatCents(123456, 'ZAR')).toBe('R1,234.56')
    expect(formatCents(123456, 'EUR')).toBe('€1,234.56')
    expect(formatCents(123456, 'GBP')).toBe('£1,234.56')
  })

  it('formats the same regardless of how large the number is', () => {
    expect(formatCents(1, 'ZAR')).toBe('R0.01')
    expect(formatCents(99, 'ZAR')).toBe('R0.99')
    expect(formatCents(100, 'ZAR')).toBe('R1.00')
    expect(formatCents(100000, 'ZAR')).toBe('R1,000.00')
    expect(formatCents(123456789012, 'ZAR')).toBe('R1,234,567,890.12')
  })

  it('formats without a symbol when asked', () => {
    expect(formatCents(123456, 'ZAR', { showSymbol: false })).toBe('1,234.56')
  })

  it('keeps a negative sign outside the symbol', () => {
    expect(formatCents(-123456, 'ZAR')).toBe('-R1,234.56')
    expect(formatCents(-50, 'ZAR', { showSymbol: false })).toBe('-0.50')
  })

  it('omits decimals for yen', () => {
    expect(formatCents(1200, 'JPY')).toBe('¥1,200')
    expect(formatCents(1200, 'JPY', { showSymbol: false })).toBe('1,200')
  })

  it('shows the code for currencies with no symbol worth printing', () => {
    expect(formatCents(123456, 'AED')).toBe('AED 1,234.56')
    expect(formatCents(123456, 'CHF')).toBe('CHF 1,234.56')
  })

  it('falls back gracefully on an unknown currency code', () => {
    expect(formatCents(1000, 'XYZ')).toBe('XYZ 10.00')
  })

  it('round-trips through the parser', () => {
    for (const cents of [1, 99, 100, 12345, 123456789012]) {
      const shown = formatCents(cents, 'ZAR', { showSymbol: false })
      expect(parseAmountToCents(shown, 'ZAR')).toBe(cents)
    }
  })

  it('rejects fractional cents', () => {
    expect(() => formatCents(10.5, 'ZAR')).toThrow(MoneyError)
  })
})

describe('sumCents', () => {
  it('adds up', () => {
    expect(sumCents([100, 200, 300])).toBe(600)
  })

  it('is zero for an empty list', () => {
    expect(sumCents([])).toBe(0)
  })

  it('rejects a non-integer member', () => {
    expect(() => sumCents([100, 0.5])).toThrow(MoneyError)
  })
})

describe('isZero', () => {
  it('is exact by default', () => {
    expect(isZero(0)).toBe(true)
    expect(isZero(1)).toBe(false)
  })

  it('accepts a tolerance', () => {
    expect(isZero(1, 1)).toBe(true)
    expect(isZero(-1, 1)).toBe(true)
    expect(isZero(2, 1)).toBe(false)
  })
})
