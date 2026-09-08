/**
 * Where an avatar's public URL points inside the bucket.
 *
 * Framework-free and importable from either side: the server uses it to clean
 * up a replaced photo, the browser uses it to discard an upload that never
 * got attached to anything.
 */

const AVATAR_PATH = /\/storage\/v1\/object\/public\/avatars\/(.+)$/

/** The object path inside the bucket, or null if this is not one of ours. */
export function avatarObjectPath(url: string | null): string | null {
  if (!url) return null
  const match = AVATAR_PATH.exec(url)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}
