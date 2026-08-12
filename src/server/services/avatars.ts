/**
 * Tidying up avatar files.
 *
 * Changing a photo writes a new object and repoints the row at it; without
 * this the old file would sit in the bucket forever. One orphan per change is
 * nothing on its own, and everything at the tenth year of using the app.
 *
 * Deletion uses the service role because a group's previous photo may have been
 * uploaded by a different admin, and the storage policy quite rightly only lets
 * people delete their own files. That is safe here: the path is derived from a
 * URL that was already stored on a row the caller was allowed to update, and
 * anything not inside the avatars bucket is ignored.
 */

import { createAdminClient } from '@/lib/supabase/server'

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

/**
 * Delete the file a previous avatar URL pointed at. Never throws: losing the
 * cleanup is a wasted few kilobytes, while losing the photo change that
 * prompted it would be a visible bug.
 */
export async function deleteAvatarObject(previousUrl: string | null): Promise<void> {
  const path = avatarObjectPath(previousUrl)
  if (!path) return

  try {
    const admin = createAdminClient()
    const { error } = await admin.storage.from('avatars').remove([path])
    if (error) console.error('Could not remove old avatar:', error.message)
  } catch (error) {
    console.error('Could not remove old avatar:', error)
  }
}
