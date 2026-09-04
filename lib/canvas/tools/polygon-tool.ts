import { bboxFromPoints } from '../geometry'
import { inImageSpace } from '../layers/interaction-layer'
import { defaultAttributes } from '@/lib/classes'
import type { Tool, ToolContext } from './types'
import type { Annotation } from '../types'
import { commandStack, useStore } from '@/lib/state/store'

/** Click within this many SCREEN pixels of the first vertex to close the shape. */
const CLOSE_RADIUS_PX = 10

const MIN_VERTICES = 3

/**
 * Polygon tool.
 *
 * While placing vertices a line follows the cursor showing where the next edge
 * lands. It moves every frame and never becomes permanent, so it is drawn on the
 * interaction layer. On the vector layer it would force every finished polygon on
 * the image to be redrawn on every pointer move.
 *
 * Vertices are never simplified. A person clicked each one, and dropping one
 * because three clicks landed nearly in a line looks like lost work.
 */
export function createPolygonTool(): Tool {
  /** Committed vertices, flat [x, y, ...] in image space. */
  let pts: number[] = []
  let cursorX = 0
  let cursorY = 0
  let hasCursor = false

  function reset() {
    pts = []
    hasCursor = false
  }

  function paint(ctx: ToolContext) {
    const color = activeColor()
    const v = ctx.viewport()
    const committed = pts.slice()
    const cx = cursorX
    const cy = cursorY
    const showBand = hasCursor && committed.length >= 2

    ctx.setPreview((c) =>
      inImageSpace(c, v, (cc, lw) => {
        if (committed.length === 0) return

        cc.lineWidth = lw
        cc.strokeStyle = color

        // placed edges, solid
        cc.beginPath()
        cc.moveTo(committed[0], committed[1])
        for (let i = 2; i < committed.length; i += 2) cc.lineTo(committed[i], committed[i + 1])
        cc.stroke()

        // rubber band to the cursor, dashed so it reads as not-yet-placed
        if (showBand) {
          cc.save()
          cc.setLineDash([6 / v.scale, 4 / v.scale])
          cc.globalAlpha = 0.8
          cc.beginPath()
          cc.moveTo(committed[committed.length - 2], committed[committed.length - 1])
          cc.lineTo(cx, cy)
          // and back to the start, previewing the closed shape
          cc.lineTo(committed[0], committed[1])
          cc.stroke()
          cc.restore()
        }

        // vertex dots, with the first one enlarged as the close target
        const r = 3 / v.scale
        cc.fillStyle = color
        for (let i = 0; i < committed.length; i += 2) {
          cc.beginPath()
          cc.arc(committed[i], committed[i + 1], i === 0 ? r * 1.6 : r, 0, Math.PI * 2)
          cc.fill()
        }
      }),
    )
    ctx.invalidate('interaction')
  }

  function close(ctx: ToolContext) {
    if (pts.length < MIN_VERTICES * 2) {
      reset()
      ctx.setPreview(null)
      ctx.invalidate('interaction')
      return
    }
    const points = new Float32Array(pts)
    reset()
    ctx.setPreview(null)
    ctx.invalidate('interaction')
    commitPolygon(points)
  }

  return {
    id: 'polygon',
    cursor: 'crosshair',

    onPointerDown(e, ctx) {
      if (e.button !== 0) return
      const p = ctx.toImage(e)

      // clicking the first vertex closes the shape
      if (pts.length >= MIN_VERTICES * 2) {
        const scale = ctx.viewport().scale
        const dx = (p.x - pts[0]) * scale
        const dy = (p.y - pts[1]) * scale
        if (Math.hypot(dx, dy) <= CLOSE_RADIUS_PX) {
          close(ctx)
          return
        }
      }

      // a double click places a final vertex and closes
      pts.push(p.x, p.y)
      if (e.detail >= 2) {
        close(ctx)
        return
      }
      paint(ctx)
    },

    onPointerMove(e, ctx) {
      if (pts.length === 0) return
      const p = ctx.toImage(e)
      cursorX = p.x
      cursorY = p.y
      hasCursor = true
      paint(ctx)
    },

    onKeyDown(e, ctx) {
      if (pts.length === 0) return
      if (e.key === 'Enter') {
        e.preventDefault()
        close(ctx)
        return true
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        reset()
        ctx.setPreview(null)
        ctx.invalidate('interaction')
        return true
      }
      // remove the last placed vertex
      if (e.key === 'Backspace') {
        e.preventDefault()
        pts.splice(-2, 2)
        paint(ctx)
        return true
      }
    },

    cancel(ctx) {
      reset()
      ctx.setPreview(null)
      ctx.invalidate('interaction')
    },
  }
}

function activeColor(): string {
  const s = useStore.getState()
  return (s.activeClassId ? s.classes[s.activeClassId]?.color : null) ?? '#14B8A6'
}

function commitPolygon(points: Float32Array): void {
  const s = useStore.getState()
  if (!s.activeImageId || !s.activeClassId) return

  const cls = s.classes[s.activeClassId]
  const annotation: Annotation = {
    id: crypto.randomUUID(),
    imageId: s.activeImageId,
    classId: s.activeClassId,
    geometry: { kind: 'polygon', points },
    bbox: bboxFromPoints(points),
    attributes: defaultAttributes(cls?.attributes ?? []),
  }

  commandStack.execute({
    label: 'Add polygon',
    do: () => useStore.getState().addAnnotation(annotation),
    undo: () => useStore.getState().removeAnnotation(annotation.id),
  })
}
