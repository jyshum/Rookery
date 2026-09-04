import { MaskBuffer, type Stroke } from './mask-buffer'
import { decodeRLE } from './rle'
import type { Annotation } from './types'

/**
 * Live mask bitmaps, keyed by annotation id.
 *
 * Kept outside the store. The store holds what gets saved and exported, which for
 * a mask is its run-length encoding. A MaskBuffer is megabytes of pixels plus
 * stroke history, and a state library should not be diffing that.
 */
const buffers = new Map<string, MaskBuffer>()

/** Get or create the buffer for an annotation. */
export function getMaskBuffer(id: string, width: number, height: number): MaskBuffer {
  const existing = buffers.get(id)
  if (existing && existing.width === width && existing.height === height) return existing

  const created = new MaskBuffer(width, height)
  buffers.set(id, created)
  return created
}

/** Look up an existing buffer without creating one. */
export function peekMaskBuffer(id: string): MaskBuffer | undefined {
  return buffers.get(id)
}

export function disposeMaskBuffer(id: string): void {
  buffers.delete(id)
}

export function clearMaskBuffers(): void {
  buffers.clear()
}

/**
 * Rebuild a buffer from persisted geometry.
 *
 * Stroke history does not survive a round trip to the database, only the
 * resulting pixels do. So a loaded mask is seeded as a single synthetic stroke
 * covering the decoded pixels; undo can step back to the loaded state but not
 * into a previous session's individual strokes. That is the honest boundary:
 * undo history is per-session.
 */
export function hydrateMaskBuffer(a: Annotation): MaskBuffer | null {
  if (a.geometry.kind !== 'mask') return null

  const { rle, width, height } = a.geometry
  const buffer = getMaskBuffer(a.id, width, height)
  buffer.reset([])
  buffer.data = decodeRLE(rle, width * height)
  buffer.version++
  return buffer
}

export type { Stroke }
