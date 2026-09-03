/**
 * Rasterized brush mask, plus the stroke history that produced it.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS CLASS EXISTS
 * ---------------------------------------------------------------------------
 * Undo has to work for the brush, and the obvious approach fails.
 *
 * The obvious approach is to copy the whole mask after every stroke and swap
 * back on undo. That is fine for boxes and polygons, which are a handful of
 * numbers. It falls apart for a mask: one full-HD mask is ~2 MB packed at a
 * byte per pixel, and ~8 MB as the RGBA that `getImageData()` hands back. Copy
 * that on every stroke and thirty strokes have eaten hundreds of megabytes.
 *
 * So we store the *action*, not the result. A stroke is the path the cursor
 * took plus a radius plus a mode. A few kilobytes.
 *
 * ---------------------------------------------------------------------------
 * WHY UNDO NEEDS A REPLAY AT ALL
 * ---------------------------------------------------------------------------
 * Painting is destructive. Stroke 100 overwrote whatever was underneath it, and
 * that information is gone. There is no layer inside the bitmap to peel off, so
 * undo cannot subtract a stroke. It has to rebuild.
 *
 * Rebuilding from scratch means replaying every remaining stroke:
 *
 *     strokes made      replays on undo     freeze
 *     50                49                  ~100ms
 *     200               199                 ~400ms
 *     500               499                 ~1s
 *
 * An annotator hits undo constantly. A one-second freeze makes the tool feel
 * broken, and it gets worse the longer they work.
 *
 * ---------------------------------------------------------------------------
 * THE FIX, AND ITS COST
 * ---------------------------------------------------------------------------
 * Snapshot the bitmap every SNAPSHOT_INTERVAL strokes. Undo restores the
 * nearest snapshot and replays only from there, so it never replays more than
 * SNAPSHOT_INTERVAL strokes no matter how long the session ran.
 *
 *     snapshot every    memory          replays    verdict
 *     1 stroke          ~830 MB @ 100   0          crashes the tab
 *     20 strokes        ~10 MB          <= 19      chosen
 *     never             ~0              up to 499  1s freeze
 *
 * We trade a bounded amount of memory for a bounded undo time. Drawing forward
 * never replays at all, so painting stays instant either way.
 *
 * Snapshots are stored packed at one byte per pixel, not as RGBA, which is why
 * a full-HD snapshot is ~2 MB rather than ~8 MB. A rolling window of
 * MAX_SNAPSHOTS keeps total snapshot memory flat.
 *
 * See spec sections 6.3 and 6.4.
 */

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
  }

  /** Replace the entire history, used when loading a mask from the server. */
  reset(strokes: Stroke[]): void {
    this.strokes = strokes.slice()
    this.snapshots = []
    this.rebuild()
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
