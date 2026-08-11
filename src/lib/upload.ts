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
