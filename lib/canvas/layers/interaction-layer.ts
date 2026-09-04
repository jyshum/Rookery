import type { Viewport } from '../types'

/**
 * Previews, cursors and hover outlines.
 *
 * Nothing here survives releasing the pointer, which is why it has its own
 * canvas. A canvas cannot erase one element, only clear and redraw, so sharing a
 * surface with finished shapes would mean redrawing all of them 60 times a second
 * to animate one line.
 */

const STROKE_PX = 2

/** Run a draw callback in image space with a screen-constant line width. */
export function inImageSpace(
  ctx: CanvasRenderingContext2D,
  v: Viewport,
  draw: (ctx: CanvasRenderingContext2D, strokeWidth: number) => void,
): void {
  ctx.save()
  ctx.translate(v.tx, v.ty)
  ctx.scale(v.scale, v.scale)
  draw(ctx, STROKE_PX / v.scale)
  ctx.restore()
}

/** Dashed rectangle preview while the box tool is dragging. */
export function drawBoxPreview(
  ctx: CanvasRenderingContext2D,
  v: Viewport,
  color: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  inImageSpace(ctx, v, (c, lw) => {
    c.lineWidth = lw
    c.strokeStyle = color
    c.setLineDash([6 / v.scale, 4 / v.scale])
    c.strokeRect(x, y, w, h)

    c.setLineDash([])
    c.globalAlpha = 0.12
    c.fillStyle = color
    c.fillRect(x, y, w, h)
  })
}

/** Solid outline under the cursor in select mode. */
export function drawHoverOutline(
  ctx: CanvasRenderingContext2D,
  v: Viewport,
  color: string,
  path: (c: CanvasRenderingContext2D) => void,
): void {
  inImageSpace(ctx, v, (c, lw) => {
    c.lineWidth = lw * 1.5
    c.strokeStyle = color
    c.globalAlpha = 0.9
    c.beginPath()
    path(c)
    c.stroke()
  })
}
