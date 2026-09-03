import type { Geometry } from '../types'

/**
 * Trace a shape's outline into the current path.
 *
 * Shared by the vector layer, hover highlighting, and drag previews so all
 * three agree on what a shape looks like. Masks have no vector outline, so they
 * fall back to their bounding box rather than drawing nothing.
 */
export function pathForAnnotation(ctx: CanvasRenderingContext2D, g: Geometry): void {
  if (g.kind === 'box') {
    ctx.rect(g.x, g.y, g.w, g.h)
    return
  }

  if (g.kind === 'polygon') {
    const pts = g.points
    if (pts.length < 4) return
    ctx.moveTo(pts[0], pts[1])
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1])
    ctx.closePath()
    return
  }

  ctx.rect(0, 0, g.width, g.height)
}
