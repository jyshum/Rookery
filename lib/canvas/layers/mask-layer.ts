import { peekMaskBuffer } from '../mask-registry'
import type { MaskBuffer } from '../mask-buffer'
import type { Annotation, LabelClass, Viewport } from '../types'

/** Painted pixels are drawn at this opacity so the photo stays readable underneath. */
const MASK_ALPHA = 0.45

interface CacheEntry {
  version: number
  color: string
  canvas: HTMLCanvasElement
}

/**
 * Painted brush masks.
 *
 * ---------------------------------------------------------------------------
 * WHY THE TINTED BITMAP IS CACHED
 * ---------------------------------------------------------------------------
 * A mask is one byte per pixel; the canvas needs four, tinted with the class
 * colour. On a 1600x1067 image that is a 6.8 MB conversion. Doing it per frame
 * would make painting unusable.
 *
 * So each annotation keeps an offscreen canvas, rebuilt only when the buffer's
 * version changes or its class colour does. Panning, zooming and drawing on a
 * different shape all reuse it untouched.
 */
const cache = new Map<string, CacheEntry>()

export function drawMaskLayer(
  ctx: CanvasRenderingContext2D,
  annotations: Annotation[],
  classes: Record<string, LabelClass>,
  v: Viewport,
): void {
  ctx.save()
  ctx.translate(v.tx, v.ty)
  ctx.scale(v.scale, v.scale)
  ctx.globalAlpha = MASK_ALPHA

  for (const a of annotations) {
    if (a.geometry.kind !== 'mask') continue

    const buffer = peekMaskBuffer(a.id)
    if (!buffer) continue

    const color = classes[a.classId]?.color ?? '#9CA3AF'
    const surface = tinted(a.id, buffer, color)
    if (surface) ctx.drawImage(surface, 0, 0)
  }

  ctx.restore()
}

/** Offscreen canvas holding the mask tinted with its class colour. */
function tinted(id: string, buffer: MaskBuffer, color: string): HTMLCanvasElement | null {
  const hit = cache.get(id)
  if (hit && hit.version === buffer.version && hit.color === color) return hit.canvas

  const canvas = hit?.canvas ?? document.createElement('canvas')
  if (canvas.width !== buffer.width || canvas.height !== buffer.height) {
    canvas.width = buffer.width
    canvas.height = buffer.height
  }

  const c = canvas.getContext('2d', { willReadFrequently: false })
  if (!c) return null

  const [r, g, b] = hexToRgb(color)
  const image = c.createImageData(buffer.width, buffer.height)
  const out = image.data
  const src = buffer.data

  for (let i = 0, p = 0; i < src.length; i++, p += 4) {
    if (src[i] === 0) continue
    out[p] = r
    out[p + 1] = g
    out[p + 2] = b
    out[p + 3] = 255
  }

  c.putImageData(image, 0, 0)
  cache.set(id, { version: buffer.version, color, canvas })
  return canvas
}

export function dropMaskCache(id: string): void {
  cache.delete(id)
}

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '')
  const full = v.length === 3 ? v.split('').map((ch) => ch + ch).join('') : v
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
