import type { Annotation } from './types'
import { pointInPolygon } from './geometry'
import { decodeRLE } from './rle'

/** Grid cell size in image pixels. */
const CELL = 128

/**
 * Grid index over image space, for finding the shape under the cursor.
 *
 * Checking every annotation on every pointer move means 200 geometry tests 60
 * times a second just to draw a hover outline. Bucketing shapes by the grid cells
 * their bounding box covers means only nearby shapes get tested.
 *
 * Bounding boxes are the coarse filter. Exact geometry is checked only for the
 * few candidates that survive it.
 */
export class SpatialIndex {
  private cells = new Map<number, Annotation[]>()
  private readonly cols: number
  private readonly rows: number

  /** How many shapes the last hitTest actually inspected. Makes the win testable. */
  lastCandidateCount = 0

  constructor(width: number, height: number) {
    this.cols = Math.max(1, Math.ceil(width / CELL))
    this.rows = Math.max(1, Math.ceil(height / CELL))
  }

  private key(cx: number, cy: number): number {
    return cy * this.cols + cx
  }

  /** Rebuild from scratch. Called when the annotation list changes. */
  rebuild(annotations: Annotation[]): void {
    this.cells.clear()

    for (const a of annotations) {
      const [x, y, w, h] = a.bbox
      const cx0 = Math.max(0, Math.floor(x / CELL))
      const cy0 = Math.max(0, Math.floor(y / CELL))
      const cx1 = Math.min(this.cols - 1, Math.floor((x + w) / CELL))
      const cy1 = Math.min(this.rows - 1, Math.floor((y + h) / CELL))

      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const k = this.key(cx, cy)
          const list = this.cells.get(k)
          if (list) list.push(a)
          else this.cells.set(k, [a])
        }
      }
    }
  }

  /** Topmost annotation containing the image-space point, or null. */
  hitTest(x: number, y: number): Annotation | null {
    const cx = Math.floor(x / CELL)
    const cy = Math.floor(y / CELL)

    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) {
      this.lastCandidateCount = 0
      return null
    }

    const candidates = this.cells.get(this.key(cx, cy)) ?? []
    this.lastCandidateCount = candidates.length

    // backwards, so the most recently drawn shape wins an overlap
    for (let i = candidates.length - 1; i >= 0; i--) {
      if (this.contains(candidates[i], x, y)) return candidates[i]
    }
    return null
  }

  private contains(a: Annotation, x: number, y: number): boolean {
    const g = a.geometry

    if (g.kind === 'box') {
      return x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h
    }

    if (g.kind === 'polygon') {
      return pointInPolygon(x, y, g.points)
    }

    const px = Math.floor(x)
    const py = Math.floor(y)
    if (px < 0 || py < 0 || px >= g.width || py >= g.height) return false
    return decodeRLE(g.rle, g.width * g.height)[py * g.width + px] === 1
  }
}
