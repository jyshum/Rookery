import type { BBox, Geometry } from './types'

/** Tight bounding box around a flat `[x, y, x, y, ...]` point list. */
export function bboxFromPoints(pts: Float32Array): BBox {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i]
    const y = pts[i + 1]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  return [minX, minY, maxX - minX, maxY - minY]
}

/**
 * Normalizes a drag rectangle. Dragging up and to the left produces negative
 * width and height, which every downstream consumer would otherwise have to
 * handle itself.
 */
export function bboxFromBox(x: number, y: number, w: number, h: number): BBox {
  return [w < 0 ? x + w : x, h < 0 ? y + h : y, Math.abs(w), Math.abs(h)]
}

/**
 * Ray casting. Counts how many edges a rightward ray from the point crosses;
 * odd means inside. Handles concave shapes, which matters because traced
 * labware outlines are rarely convex.
 */
export function pointInPolygon(px: number, py: number, pts: Float32Array): boolean {
  let inside = false
  const n = pts.length / 2

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2]
    const yi = pts[i * 2 + 1]
    const xj = pts[j * 2]
    const yj = pts[j * 2 + 1]

    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }

  return inside
}

/**
 * Distance from a point to a line segment, clamped to the segment's endpoints.
 * Used for vertex-edge hit testing and by Ramer-Douglas-Peucker.
 */
export function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy

  // clamp the projection onto [0, 1] so the foot never runs past an endpoint
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))

  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * Offset a shape by a delta in image space.
 *
 * Masks are returned unchanged. A mask's pixels are baked at absolute
 * positions, so moving one means re-rasterizing and re-encoding the whole
 * thing. Dragging a painted region is not a workflow this tool supports, and
 * silently producing a wrong mask would be worse than not moving it.
 */
export function translateGeometry(g: Geometry, dx: number, dy: number): Geometry {
  if (g.kind === 'box') {
    return { kind: 'box', x: g.x + dx, y: g.y + dy, w: g.w, h: g.h }
  }

  if (g.kind === 'polygon') {
    const next = new Float32Array(g.points.length)
    for (let i = 0; i < g.points.length; i += 2) {
      next[i] = g.points[i] + dx
      next[i + 1] = g.points[i + 1] + dy
    }
    return { kind: 'polygon', points: next }
  }

  return g
}

/** True when a shape can be dragged. Masks cannot. See `translateGeometry`. */
export function isMovable(g: Geometry): boolean {
  return g.kind !== 'mask'
}

export function translateBBox(b: BBox, dx: number, dy: number): BBox {
  return [b[0] + dx, b[1] + dy, b[2], b[3]]
}
