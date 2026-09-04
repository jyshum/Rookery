/**
 * The painted mask, plus the strokes that produced it.
 *
 * Copying the whole mask after every stroke would work but costs too much
 * memory: one full-HD mask is ~2 MB packed, ~8 MB as RGBA. So a stroke is
 * stored as the path the cursor took, which is a few kilobytes.
 *
 * Painting is destructive, so undo cannot subtract a stroke. It rebuilds by
 * replaying. Replaying from the start gets slower the longer you work, so we
 * snapshot the bitmap every SNAPSHOT_INTERVAL strokes and replay only from the
 * nearest one. That caps undo at 20 replays for about 10 MB of snapshots.
 */

import type { BBox } from './types'

export interface Stroke {
  /** Flat `[x, y, x, y, ...]` in image space. */
  points: Float32Array
  radius: number
  mode: 'paint' | 'erase'
}

interface Snapshot {
  /** Stroke count at the moment this snapshot was taken. */
  index: number
  data: Uint8Array
}

export class MaskBuffer {
  /** Strokes between snapshots. Caps undo replay cost at this number. */
  static readonly SNAPSHOT_INTERVAL = 20

  /** Rolling window size. Bounds total snapshot memory. */
  static readonly MAX_SNAPSHOTS = 5

  readonly width: number
  readonly height: number

  /** One byte per pixel: 1 = inside the mask, 0 = outside. */
  data: Uint8Array

  private strokes: Stroke[] = []
  private snapshots: Snapshot[] = []

  /**
   * How many strokes the last rebuild had to replay. Exposed so the snapshot
   * guarantee is testable rather than merely asserted.
   */
  lastReplayCount = 0

  /**
   * Bumped on every change. The mask layer caches an offscreen bitmap keyed on
   * this, so it re-tints pixels only when they actually changed rather than on
   * every frame.
   */
  version = 0

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.data = new Uint8Array(width * height)
  }

  get strokeCount(): number {
    return this.strokes.length
  }

  get snapshotIndices(): number[] {
    return this.snapshots.map((s) => s.index)
  }

  /** Paint or erase one stroke. Forward drawing never replays history. */
  apply(s: Stroke): void {
    this.strokes.push(s)
    this.rasterize(s)
    this.version++

    if (this.strokes.length % MaskBuffer.SNAPSHOT_INTERVAL === 0) {
      this.snapshots.push({ index: this.strokes.length, data: this.data.slice() })
      if (this.snapshots.length > MaskBuffer.MAX_SNAPSHOTS) this.snapshots.shift()
    }
  }

  /** Drop the most recent stroke and rebuild the bitmap without it. */
  undo(): void {
    if (this.strokes.length === 0) {
      this.lastReplayCount = 0
      return
    }
    this.strokes.pop()
    this.rebuild()
    this.version++
  }

  /** Replace the entire history, used when loading a mask from the server. */
  reset(strokes: Stroke[]): void {
    this.strokes = strokes.slice()
    this.snapshots = []
    this.rebuild()
    this.version++
  }

  /**
   * Tight bounding box around the filled pixels.
   *
   * Every annotation carries a bbox regardless of shape type, because training
   * pipelines expect one and should not have to decode an RLE to find it.
   * Returns a zero box when nothing is painted.
   */
  bounds(): BBox {
    let minX = Infinity
    let minY = Infinity
    let maxX = -1
    let maxY = -1

    for (let y = 0; y < this.height; y++) {
      const row = y * this.width
      for (let x = 0; x < this.width; x++) {
        if (this.data[row + x] === 0) continue
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }

    if (maxX < 0) return [0, 0, 0, 0]
    return [minX, minY, maxX - minX + 1, maxY - minY + 1]
  }

  /** True when no pixel is set. Used to discard an annotation erased to nothing. */
  isEmpty(): boolean {
    return !this.data.some((v) => v !== 0)
  }

  /**
   * Restore the newest snapshot at or before the current head, then replay
   * forward. Snapshots taken after the head are stale and get discarded.
   */
  private rebuild(): void {
    const target = this.strokes.length

    while (
      this.snapshots.length > 0 &&
      this.snapshots[this.snapshots.length - 1].index > target
    ) {
      this.snapshots.pop()
    }

    const snap = this.snapshots[this.snapshots.length - 1]
    let from: number

    if (snap) {
      this.data = snap.data.slice()
      from = snap.index
    } else {
      this.data = new Uint8Array(this.width * this.height)
      from = 0
    }

    for (let i = from; i < target; i++) this.rasterize(this.strokes[i])
    this.lastReplayCount = target - from
  }

  /**
   * Stamp a stroke into the bitmap.
   *
   * Pointer samples arrive on a timer, so a fast drag produces widely spaced
   * points. Stamping only at those points would leave a dotted line, so we
   * interpolate between consecutive samples at roughly one stamp per pixel.
   */
  private rasterize(s: Stroke): void {
    const value = s.mode === 'paint' ? 1 : 0
    const n = s.points.length / 2

    if (n === 0) return
    if (n === 1) {
      this.stamp(s.points[0], s.points[1], s.radius, value)
      return
    }

    for (let i = 1; i < n; i++) {
      const x0 = s.points[(i - 1) * 2]
      const y0 = s.points[(i - 1) * 2 + 1]
      const x1 = s.points[i * 2]
      const y1 = s.points[i * 2 + 1]

      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)))
      for (let t = 0; t <= steps; t++) {
        const f = t / steps
        this.stamp(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, s.radius, value)
      }
    }
  }

  /** Filled circle of radius `r`, clipped to the image bounds. */
  private stamp(cx: number, cy: number, r: number, value: number): void {
    const x0 = Math.max(0, Math.floor(cx - r))
    const x1 = Math.min(this.width - 1, Math.ceil(cx + r))
    const y0 = Math.max(0, Math.floor(cy - r))
    const y1 = Math.min(this.height - 1, Math.ceil(cy + r))
    const rSq = r * r

    for (let y = y0; y <= y1; y++) {
      const dy = y - cy
      const row = y * this.width
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx
        if (dx * dx + dy * dy <= rSq) this.data[row + x] = value
      }
    }
  }
}
