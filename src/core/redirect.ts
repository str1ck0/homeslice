/**
 * Where to send someone after they sign in, given the `next` they arrived with.
 *
 * `next` comes from the address bar, so anyone can write it, and it used to be
 * trusted as it was. `//evil.example` is not a path: browsers read it as
 * "https://evil.example". So a genuine Homeslice link could deliver someone —
 * freshly signed in, and trusting what they had just seen — to a copy of the
 * site asking for their password again.
 *
 * Only a path on this site is accepted. Anything else lands on the fallback.
 */

// Any origin that cannot be real will do: it only exists to resolve against.
const BASE = 'https://homeslice.invalid'

export function safeRedirectPath(
  next: string | null | undefined,
  fallback = '/dashboard'
): string {
  if (!next || !next.startsWith('/')) return fallback

  let url: URL
  try {
    url = new URL(next, BASE)
  } catch {
    return fallback
  }

  // Catches "//host", "/\host" and tab-smuggled variants, all of which the URL
  // parser resolves to another origin.
  if (url.origin !== BASE) return fallback

  // "/.//host" survives as the path "//host", which the client router would
  // still treat as another site.
  if (url.pathname.startsWith('//')) return fallback

  return `${url.pathname}${url.search}${url.hash}`
}
