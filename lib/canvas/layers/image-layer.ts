import type { Viewport } from '../types'

/**
 * The photo being annotated.
 *
 * The cheapest layer to draw and the most expensive to draw needlessly, which
 * is exactly why it gets its own canvas. It only repaints when the viewport
 * moves or the image changes, so it stays untouched through an entire brush
 * stroke or rubber-band drag.
 *
 * Follows the renderer's transform contract: relative transforms only, since
 * the context arrives already scaled for devicePixelRatio.
 */
export function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap | null,
  v: Viewport,
): void {
  if (!bitmap) return

  ctx.save()
  ctx.translate(v.tx, v.ty)
  ctx.scale(v.scale, v.scale)

  // smooth when shrinking, crisp when magnified. Zoomed in, an annotator is
  // looking at individual pixels to place a boundary; interpolation there
  // invents detail that is not in the source frame.
  ctx.imageSmoothingEnabled = v.scale < 1

  ctx.drawImage(bitmap, 0, 0)
  ctx.restore()
}

/**
 * Decode an image off the main thread.
 *
 * `new Image()` decodes on the main thread and stalls everything else while a
 * multi-megapixel photo is unpacked. `createImageBitmap` hands the work to the
 * browser to do elsewhere and returns something the canvas can draw directly.
 */
export async function loadBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load image: ${url} (${res.status})`)
  return createImageBitmap(await res.blob())
}
