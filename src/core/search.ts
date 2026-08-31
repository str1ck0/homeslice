/**
 * Matching text the way a person searching a list expects.
 *
 * Two rules, both learned from typing into the real thing:
 *
 * **Words match from their start, not from anywhere inside.** A plain
 * substring search for "bo" matches "Lis-bo-n", so typing a housemate's name
 * returned every expense from the trip. Prefix matching is also what makes
 * short queries useful at all: "ai" should find "Airbnb", not everything
 * containing those two letters in that order.
 *
 * **Accents are ignored on both sides.** "Pastéis de Belém" has to be findable
 * by someone typing "pasteis", because that is what a keyboard makes easy and
 * nobody wants to fight an autocomplete to find a custard tart.
 */

/**
 * Fold text to its searchable form: accents stripped, punctuation turned to
 * spaces, lower-cased, and with a leading space so that every word — including
 * the first — is preceded by one. `matches` relies on that leading space to
 * find word starts without needing a regex, which keeps it fast enough to run
 * over every row on every keystroke.
 */
export function searchable(...parts: (string | null | undefined)[]): string {
  const text = parts.filter(Boolean).join(' ')
  const folded = text
    .normalize('NFD')
    // Combining marks: é decomposes to e + U+0301, and this drops the U+0301.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Anything that is not a letter or digit is a word separator. Unicode-aware
    // so that this does not quietly mangle a non-Latin name into nothing.
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

  return folded === '' ? '' : ` ${folded}`
}

/**
 * Does this haystack match everything the query asks for?
 *
 * Every word in the query must prefix some word in the haystack, in any order,
 * so "sam coffee" and "coffee sam" both find the coffee Sam paid for. An empty
 * query matches everything, which is what makes an empty search box mean "no
 * filter" rather than "no results".
 *
 * `haystack` must already have come from `searchable`.
 */
export function matches(haystack: string, query: string): boolean {
  const needles = searchable(query).split(' ').filter(Boolean)
  if (needles.length === 0) return true
  return needles.every((needle) => haystack.includes(` ${needle}`))
}
