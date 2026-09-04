import { bboxFromPoints } from '../geometry'
import { inImageSpace } from '../layers/interaction-layer'
import { defaultAttributes } from '@/lib/classes'
import type { Tool, ToolContext } from './types'
import type { Annotation } from '../types'
import { commandStack, useStore } from '@/lib/state/store'

/** Click within this many screen pixels of the first vertex to close the shape. */
const CLOSE_RADIUS_PX = 12

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
 *
 * Finishing is deliberately offered four ways: click the first point, press
 * Enter, double click, or right click. An unfinished shape with no obvious way
 * to close it is the most common way this kind of tool frustrates people, so the
 * canvas also shows what the options are while a polygon is open.
 */
export function createPolygonTool(): Tool {
  let pts: number[] = []
  let cursorX = 0
  let cursorY = 0
  let hasCursor = false

  function reset() {
    pts = []
    hasCursor = false
  }

  /** True when the cursor is over the first vertex, which closes the shape. */
  function overCloseTarget(scale: number): boolean {
    if (pts.length < MIN_VERTICES * 2 || !hasCursor) return false
    const dx = (cursorX - pts[0]) * scale
    const dy = (cursorY - pts[1]) * scale
    return Math.hypot(dx, dy) <= CLOSE_RADIUS_PX
  }

  function paint(ctx: ToolContext) {
    const color = activeColor()
    const v = ctx.viewport()
    const committed = pts.slice()
    const cx = cursorX
    const cy = cursorY
    const showBand = hasCursor && committed.length >= 2
    const canClose = committed.length >= MIN_VERTICES * 2
    const snapping = overCloseTarget(v.scale)

    ctx.setPreview((c) => {
      if (committed.length > 0) {
        inImageSpace(c, v, (cc, lw) => {
          cc.lineWidth = lw
          cc.strokeStyle = color

          cc.beginPath()
          cc.moveTo(committed[0], committed[1])
          for (let i = 2; i < committed.length; i += 2) cc.lineTo(committed[i], committed[i + 1])
          cc.stroke()

          if (showBand) {
            cc.save()
            cc.setLineDash([6 / v.scale, 4 / v.scale])
            cc.globalAlpha = 0.8
            cc.beginPath()
            cc.moveTo(committed[committed.length - 2], committed[committed.length - 1])
            cc.lineTo(cx, cy)
            cc.lineTo(committed[0], committed[1])
            cc.stroke()
            cc.restore()
          }

          const r = 3 / v.scale
          cc.fillStyle = color
          for (let i = 0; i < committed.length; i += 2) {
            cc.beginPath()
            cc.arc(committed[i], committed[i + 1], r, 0, Math.PI * 2)
            cc.fill()
          }

          // the first vertex is the close target, so make it look like one
          if (canClose) {
            cc.beginPath()
            cc.arc(committed[0], committed[1], CLOSE_RADIUS_PX / v.scale, 0, Math.PI * 2)
            cc.strokeStyle = snapping ? '#FFFFFF' : color
            cc.lineWidth = (snapping ? 2 : 1) / v.scale
            cc.globalAlpha = snapping ? 1 : 0.5
            cc.stroke()
            cc.globalAlpha = 1
          }
        })
      }

      if (committed.length > 0) drawHint(c, committed.length / 2, canClose)
    })
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

  /** Drop the most recent vertex, cancelling the shape if none are left. */
  function dropLastVertex(ctx: ToolContext) {
    pts.splice(-2, 2)
    if (pts.length === 0) {
      reset()
      ctx.setPreview(null)
      ctx.invalidate('interaction')
    } else {
      paint(ctx)
    }
  }

  return {
    id: 'polygon',
    cursor: 'crosshair',

    onPointerDown(e, ctx) {
      // right click finishes, matching how most drawing tools behave
      if (e.button === 2) {
        if (pts.length >= MIN_VERTICES * 2) close(ctx)
        return
      }
      if (e.button !== 0) return

      const p = ctx.toImage(e)
      cursorX = p.x
      cursorY = p.y
      hasCursor = true

      if (overCloseTarget(ctx.viewport().scale)) {
        close(ctx)
        return
      }

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

      // while a shape is open, undo means "take back that vertex". Letting it
      // fall through would undo a previously finished annotation instead, which
      // is never what someone mid-polygon is asking for.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        dropLastVertex(ctx)
        return true
      }

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
      if (e.key === 'Backspace') {
        e.preventDefault()
        dropLastVertex(ctx)
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

/**
 * On-canvas prompt while a polygon is open.
 *
 * Drawn in screen space rather than image space, so it stays a readable size at
 * any zoom. Without this the ways to finish are invisible, which is the whole
 * problem.
 */
function drawHint(c: CanvasRenderingContext2D, vertices: number, canClose: boolean): void {
  const dpr = window.devicePixelRatio || 1
  const w = c.canvas.width / dpr
  const h = c.canvas.height / dpr

  const text = canClose
    ? `${vertices} points · click the first point, Enter or right click to finish · ⌘Z removes the last · Esc cancels`
    : `${vertices} point${vertices === 1 ? '' : 's'} · place at least 3 · Esc cancels`

  c.save()
  c.font = '11px ui-monospace, monospace'
  c.textAlign = 'center'
  c.textBaseline = 'middle'

  const metrics = c.measureText(text)
  const padX = 10
  const boxW = metrics.width + padX * 2
  const boxH = 22
  const x = w / 2 - boxW / 2
  const y = h - boxH - 14

  c.fillStyle = 'rgba(5, 5, 5, 0.85)'
  c.strokeStyle = 'rgba(255, 255, 255, 0.12)'
  c.lineWidth = 1
  c.beginPath()
  c.roundRect(x, y, boxW, boxH, 4)
  c.fill()
  c.stroke()

  c.fillStyle = canClose ? '#14B8A6' : '#9CA3AF'
  c.fillText(text, w / 2, y + boxH / 2 + 0.5)
  c.restore()
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
