/**
 * Client-side image compression.
 *
 * Phone cameras produce 3-5 MB photos. Resizing and re-encoding as JPEG takes
 * that down by an order of magnitude, which matters on mobile data and against
 * the free plan's 1 GB of storage.
 *
 * The defaults here are generous; callers choose their own. Receipts use
 * 1400px at 0.72 (see uploadReceipts), because the point is to read the line
 * items back later, and avatars a 512px square. The defaults used to be what
 * receipts got, and averaged 550 KB a photo — not the 300 KB this comment once
 * promised.
 */

export interface CompressOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  /**
   * Take the largest centred square before resizing. Avatars are always shown
   * in a circle, so cropping here means storing only the pixels that will ever
   * be seen — and it stops a tall portrait being decided by whatever the
   * browser's object-fit does.
   */
  square?: boolean
}

export async function compressImage(
  file: File,
  { maxWidth = 1600, maxHeight = 1600, quality = 0.82, square = false }: CompressOptions = {}
): Promise<File> {
  // Anything that isn't a bitmap (HEIC on older browsers, PDFs) is passed
  // through untouched rather than corrupted by a canvas round-trip.
  if (!file.type.startsWith('image/')) return file

  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file

  // Source rectangle: the whole image, or its centred square.
  const side = Math.min(bitmap.width, bitmap.height)
  // Recorded before the bitmap is closed below.
  const cropped = square && bitmap.width !== bitmap.height
  const source = square
    ? {
        x: Math.round((bitmap.width - side) / 2),
        y: Math.round((bitmap.height - side) / 2),
        width: side,
        height: side,
      }
    : { x: 0, y: 0, width: bitmap.width, height: bitmap.height }

  let { width, height } = source
  const scale = Math.min(maxWidth / width, maxHeight / height, 1)
  width = Math.round(width * scale)
  height = Math.round(height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) return file

  context.drawImage(
    bitmap,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    width,
    height
  )
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality)
  )
  if (!blob) return file

  // If compression made it bigger (already-small images), keep the original —
  // but never when cropping, or the returned file would not be square at all.
  if (blob.size >= file.size && scale === 1 && !cropped) return file

  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}
