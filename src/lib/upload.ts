'use client'

import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/image-utils'

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

export async function uploadReceipts(files: File[]): Promise<string[]> {
  if (files.length === 0) return []

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new UploadError('You need to be signed in to attach photos')

  const paths: string[] = []

  for (const file of files) {
    const compressed = await compressImage(file)
    const path = `${user.id}/${crypto.randomUUID()}.jpg`

    const { error } = await supabase.storage
      .from('receipts')
      .upload(path, compressed, { contentType: compressed.type, upsert: false })

    if (error) throw new UploadError(error.message)
    paths.push(path)
  }

  return paths
}
