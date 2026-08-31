import { describe, expect, it } from 'vitest'
import { matches, searchable } from '../search'

describe('searchable', () => {
  it('folds accents so a plain keyboard can find them', () => {
    expect(searchable('Pastéis de Belém')).toBe(' pasteis de belem')
    expect(searchable('La Carbonería')).toBe(' la carboneria')
  })

  it('turns punctuation into word breaks', () => {
    expect(searchable('Airbnb, three nights')).toBe(' airbnb three nights')
    expect(searchable('GG rent (R1527 to €)')).toBe(' gg rent r1527 to')
  })

  it('joins its parts and drops the empty ones', () => {
    expect(searchable('Coffee', null, 'Ada', undefined)).toBe(' coffee ada')
  })

  it('survives a string with nothing searchable in it', () => {
    expect(searchable('€ — ·')).toBe('')
    expect(searchable(null)).toBe('')
  })

  it('keeps non-Latin scripts rather than deleting them', () => {
    expect(searchable('Ελλάδα')).toBe(' ελλαδα')
    expect(searchable('東京')).toBe(' 東京')
  })
})

describe('matches', () => {
  const haystack = searchable('Wine shop', 'Bo', 'Groceries', 'Lisbon 2026')

  it('matches a word from its start', () => {
    expect(matches(haystack, 'bo')).toBe(true)
    expect(matches(haystack, 'win')).toBe(true)
    expect(matches(haystack, 'groc')).toBe(true)
  })

  it('does not match mid-word, which is what made "bo" find "Lisbon"', () => {
    expect(matches(searchable('Lisbon 2026'), 'bo')).toBe(false)
    expect(matches(searchable('Museum tickets'), 'ick')).toBe(false)
  })

  it('requires every word, in any order', () => {
    expect(matches(haystack, 'bo wine')).toBe(true)
    expect(matches(haystack, 'wine bo')).toBe(true)
    expect(matches(haystack, 'wine ada')).toBe(false)
  })

  it('treats an empty query as no filter at all', () => {
    expect(matches(haystack, '')).toBe(true)
    expect(matches(haystack, '   ')).toBe(true)
  })

  it('ignores accents and case on the query side too', () => {
    const belem = searchable('Pastéis de Belém')
    expect(matches(belem, 'belem')).toBe(true)
    expect(matches(belem, 'Belém')).toBe(true)
    expect(matches(belem, 'PASTEIS')).toBe(true)
  })

  it('matches digits, so an amount typed into the box still finds things', () => {
    expect(matches(searchable('Flight 2026'), '2026')).toBe(true)
  })
})
