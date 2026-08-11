/**
 * Client-side image compression.
 *
 * Phone cameras produce 3-5 MB photos. A receipt only needs to be readable,
 * so resizing to fit within 1600px and re-encoding as JPEG typically gets it
 * under 300 KB — which matters on mobile data and keeps storage costs at zero.
 *
 * Receipts get a larger bound than avatars because the point is to read the
 * line items back later.
 */

export interface CompressOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
}

export async function compressImage(
  file: File,
  { maxWidth = 1600, maxHeight = 1600, quality = 0.82 }: CompressOptions = {}
): Promise<File> {
  // Anything that isn't a bitmap (HEIC on older browsers, PDFs) is passed
  // through untouched rather than corrupted by a canvas round-trip.
  if (!file.type.startsWith('image/')) return file

  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file

  let { width, height } = bitmap
  const scale = Math.min(maxWidth / width, maxHeight / height, 1)
  width = Math.round(width * scale)
  height = Math.round(height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) return file

  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality)
  )
  if (!blob) return file

  // If compression made it bigger (already-small images), keep the original.
  if (blob.size >= file.size && scale === 1) return file

  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}
