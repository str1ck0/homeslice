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
