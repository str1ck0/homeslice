'use client'

import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/image-utils'
import { avatarObjectPath } from '@/lib/avatar-path'

export class UploadError extends Error {}

/**
 * Upload receipt photos to the private `receipts` bucket.
 *
 * Files are stored under the uploader's auth id, which is what the storage
 * policy keys on. Other group members never read the bucket directly — they
 * go through /api/expense-images/[id], which checks expense access and issues
 * a short-lived signed URL. That keeps the bucket genuinely private: a receipt
 * shows what you bought and where you were.
 */
/**
 * Upload an avatar and return its public URL.
 *
 * Unlike receipts this bucket is public, because avatars appear dozens to a
 * page and routing every face through a signed-URL redirect would cost a
 * request each. The path still starts with the uploader's auth id, which is
 * what the storage policy checks — public to read, yours alone to write.
 *
 * Group avatars go through here too: the file lives under whoever uploaded it,
 * and only the URL is attached to the group.
 */
export async function uploadAvatar(file: File): Promise<string> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new UploadError('You need to be signed in to change a photo')

  // 512px square is plenty: the largest it is ever drawn is 56px, and twice
  // that again for a retina screen.
  const compressed = await compressImage(file, {
    maxWidth: 512,
    maxHeight: 512,
    quality: 0.85,
    square: true,
  })

  if (compressed.size > 5 * 1024 * 1024) {
    throw new UploadError('That image is too large — try a smaller one')
  }

  const path = `${user.id}/${crypto.randomUUID()}.jpg`

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, compressed, { contentType: compressed.type, upsert: false })

  if (error) throw new UploadError(error.message)

  const {
    data: { publicUrl },
  } = supabase.storage.from('avatars').getPublicUrl(path)

  return publicUrl
}

/**
 * Discard an avatar that was uploaded but never attached to anything — a photo
 * chosen on the create-group form and then swapped or removed before the group
 * existed. Once a URL is on a row the server does this cleanup instead, with
 * the service role, because the previous photo may be somebody else's file.
 * Here it is always the caller's own upload, which the storage policy allows.
 *
 * Never throws: an orphaned file is a few wasted kilobytes, and failing the
 * user's actual action over it would be the worse outcome.
 */
export async function discardAvatarUpload(url: string | null): Promise<void> {
  const path = avatarObjectPath(url)
  if (!path) return
  try {
    const { error } = await createClient().storage.from('avatars').remove([path])
    if (error) console.error('Could not discard unused avatar:', error.message)
  } catch (error) {
    console.error('Could not discard unused avatar:', error)
  }
}

export async function uploadReceipts(files: File[]): Promise<string[]> {
  if (files.length === 0) return []

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new UploadError('You need to be signed in to attach photos')

  const paths: string[] = []

  for (const file of files) {
    // 1400px on the long edge at 0.72. The old 1600 at 0.82 averaged 550 KB a
    // photo in production; this is about a third smaller. Checked on
    // 14 September against small print in a real photo: 1400/0.72 still read
    // cleanly, 1200/0.70 had started to smear, so this is about as far as it
    // goes while a receipt stays a receipt.
    const compressed = await compressImage(file, { maxWidth: 1400, maxHeight: 1400, quality: 0.72 })
    const path = `${user.id}/${crypto.randomUUID()}.jpg`

    const { error } = await supabase.storage
      .from('receipts')
      .upload(path, compressed, { contentType: compressed.type, upsert: false })

    if (error) throw new UploadError(error.message)
    paths.push(path)
  }

  return paths
}
