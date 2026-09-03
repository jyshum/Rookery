import type { Annotation, LabelClass, Viewport } from '../types'

const HANDLE_PX = 6
const STROKE_PX = 2
const FILL_ALPHA = 0.14

/**
 * Committed boxes and polygons.
 *
 * Repaints only when a shape is added, moved, or deleted. It is deliberately
 * untouched while a tool is mid-gesture: previews belong on the interaction
 * layer so that dragging never forces a redraw of every finished shape.
 *
 * Line widths are divided by the viewport scale so strokes stay a constant
 * thickness on screen. Without that, an outline drawn at 8x zoom would render
 * as an eight-pixel slab and hide the boundary the annotator is trying to place.
 */
export function drawVectorLayer(
  ctx: CanvasRenderingContext2D,
  annotations: Annotation[],
  classes: Record<string, LabelClass>,
  v: Viewport,
  selectedId: string | null,
): void {
  ctx.save()
  ctx.translate(v.tx, v.ty)
  ctx.scale(v.scale, v.scale)

  const stroke = STROKE_PX / v.scale

  for (const a of annotations) {
    const color = classes[a.classId]?.color ?? '#9CA3AF'
    const selected = a.id === selectedId

    ctx.lineWidth = selected ? stroke * 1.75 : stroke
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.globalAlpha = FILL_ALPHA

    if (a.geometry.kind === 'box') {
      const { x, y, w, h } = a.geometry
      ctx.fillRect(x, y, w, h)
      ctx.globalAlpha = 1
      ctx.strokeRect(x, y, w, h)
    } else if (a.geometry.kind === 'polygon') {
      const pts = a.geometry.points
      if (pts.length >= 4) {
        ctx.beginPath()
        ctx.moveTo(pts[0], pts[1])
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1])
        ctx.closePath()
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.stroke()
      }
    }

    ctx.globalAlpha = 1
    if (selected) drawHandles(ctx, a, v)
  }

  ctx.restore()
}

/** Square grips at each vertex of the selected shape. */
function drawHandles(ctx: CanvasRenderingContext2D, a: Annotation, v: Viewport): void {
  const size = HANDLE_PX / v.scale
  const half = size / 2

  const points: Array<[number, number]> = []
  if (a.geometry.kind === 'box') {
    const { x, y, w, h } = a.geometry
    points.push([x, y], [x + w, y], [x + w, y + h], [x, y + h])
  } else if (a.geometry.kind === 'polygon') {
    const pts = a.geometry.points
    for (let i = 0; i < pts.length; i += 2) points.push([pts[i], pts[i + 1]])
  }

  ctx.fillStyle = '#FFFFFF'
  ctx.strokeStyle = '#0A0A0B'
  ctx.lineWidth = 1 / v.scale
  for (const [px, py] of points) {
    ctx.fillRect(px - half, py - half, size, size)
    ctx.strokeRect(px - half, py - half, size, size)
  }
}
