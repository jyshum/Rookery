import { isMovable, translateBBox, translateGeometry } from '../geometry'
import { inImageSpace } from '../layers/interaction-layer'
import { pathForAnnotation } from '../layers/shape-path'
import type { Tool } from './types'
import type { Annotation, Point } from '../types'
import { commandStack, useStore } from '@/lib/state/store'

/** Drag distance, in image pixels, below which a gesture counts as a click. */
const DRAG_THRESHOLD = 2

/**
 * Selection and move.
 *
 * Hover feedback and the drag preview both live on the interaction layer, so
 * moving the pointer across a busy image never repaints the committed shapes.
 * The original stays put on the vector layer until the drag is committed,
 * which is what makes an in-flight move cancellable.
 */
export function createSelectTool(): Tool {
  let dragging: Annotation | null = null
  let startX = 0
  let startY = 0
  let dx = 0
  let dy = 0
  let hoveredId: string | null = null

  return {
    id: 'select',
    cursor: 'default',

    onPointerDown(e, ctx) {
      if (e.button !== 0) return
      const p = ctx.toImage(e)
      const hit = ctx.hitTest(p)

      useStore.getState().setSelected(hit?.id ?? null)

      if (hit && isMovable(hit.geometry)) {
        dragging = hit
        startX = p.x
        startY = p.y
        dx = 0
        dy = 0
      }
    },

    onPointerMove(e, ctx) {
      const p = ctx.toImage(e)

      if (dragging) {
        dx = p.x - startX
        dy = p.y - startY
        const moved = translateGeometry(dragging.geometry, dx, dy)
        const color = colorFor(dragging)

        ctx.setPreview((c) =>
          inImageSpace(c, ctx.viewport(), (cc, lw) => {
            cc.lineWidth = lw
            cc.strokeStyle = color
            cc.globalAlpha = 0.9
            cc.beginPath()
            pathForAnnotation(cc, moved)
            cc.stroke()
          }),
        )
        ctx.invalidate('interaction')
        return
      }

      // hover feedback, only repainted when the hovered shape actually changes
      const hit = ctx.hitTest(p)
      if (hit?.id === hoveredId) return
      hoveredId = hit?.id ?? null

      if (!hit) {
        ctx.setPreview(null)
      } else {
        const color = colorFor(hit)
        ctx.setPreview((c) =>
          inImageSpace(c, ctx.viewport(), (cc, lw) => {
            cc.lineWidth = lw * 1.5
            cc.strokeStyle = color
            cc.globalAlpha = 0.75
            cc.beginPath()
            pathForAnnotation(cc, hit.geometry)
            cc.stroke()
          }),
        )
      }
      ctx.invalidate('interaction')
    },

    onPointerUp(_e, ctx) {
      const target = dragging
      dragging = null
      ctx.setPreview(null)
      hoveredId = null
      ctx.invalidate('interaction')

      if (!target) return
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return

      commitMove(target.id, dx, dy)
    },

    cancel(ctx) {
      dragging = null
      hoveredId = null
      ctx.setPreview(null)
      ctx.invalidate('interaction')
    },
  }
}

function colorFor(a: Annotation): string {
  return useStore.getState().classes[a.classId]?.color ?? '#9CA3AF'
}

/**
 * Stores the delta the shape moved by.
 *
 * Undo is then just the opposite delta, which is a handful of bytes rather than
 * a copy of the geometry. Consistent with how every other edit is recorded.
 */
function commitMove(id: string, dx: number, dy: number): void {
  const apply = (ox: number, oy: number) => {
    const current = useStore.getState().annotations[id]
    if (!current) return
    useStore.getState().updateAnnotation(id, {
      geometry: translateGeometry(current.geometry, ox, oy),
      bbox: translateBBox(current.bbox, ox, oy),
    })
  }

  commandStack.execute({
    label: 'Move shape',
    do: () => apply(dx, dy),
    undo: () => apply(-dx, -dy),
  })
}

export type { Point }
