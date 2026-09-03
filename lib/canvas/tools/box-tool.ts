import { bboxFromBox } from '../geometry'
import { drawBoxPreview } from '../layers/interaction-layer'
import type { Tool } from './types'
import { commandStack, useStore } from '@/lib/state/store'
import type { Annotation } from '../types'
import { defaultAttributes } from '@/lib/classes'

/** Ignore accidental click-drags smaller than this, in image pixels. */
const MIN_SIZE = 3

/**
 * Bounding box tool.
 *
 * The cheapest annotation to produce and the coarsest. Correct when an
 * annotator only needs to say "the thing is roughly here"; wrong for a
 * diagonal pipette, where the box is mostly empty bench. See spec 4.
 *
 * While dragging, only the interaction layer repaints. The committed shapes and
 * the photo underneath are never touched.
 */
export function createBoxTool(): Tool {
  let dragging = false
  let originX = 0
  let originY = 0

  return {
    id: 'box',
    cursor: 'crosshair',

    onPointerDown(e, ctx) {
      if (e.button !== 0) return
      const p = ctx.toImage(e)
      dragging = true
      originX = p.x
      originY = p.y
    },

    onPointerMove(e, ctx) {
      if (!dragging) return
      const p = ctx.toImage(e)
      const color = activeColor()
      const x = originX
      const y = originY
      const w = p.x - originX
      const h = p.y - originY

      ctx.setPreview((c) => drawBoxPreview(c, ctx.viewport(), color, x, y, w, h))
      ctx.invalidate('interaction')
    },

    onPointerUp(e, ctx) {
      if (!dragging) return
      dragging = false

      const p = ctx.toImage(e)
      ctx.setPreview(null)
      ctx.invalidate('interaction')

      const bbox = bboxFromBox(originX, originY, p.x - originX, p.y - originY)
      // a click without a drag is not a box; treat it as a miss rather than
      // littering the image with zero-area annotations
      if (bbox[2] < MIN_SIZE || bbox[3] < MIN_SIZE) return

      commitBox(bbox)
    },

    cancel(ctx) {
      dragging = false
      ctx.setPreview(null)
      ctx.invalidate('interaction')
    },
  }
}

function activeColor(): string {
  const s = useStore.getState()
  return (s.activeClassId ? s.classes[s.activeClassId]?.color : null) ?? '#14B8A6'
}

function commitBox(bbox: [number, number, number, number]): void {
  const s = useStore.getState()
  if (!s.activeImageId || !s.activeClassId) return

  const cls = s.classes[s.activeClassId]
  const annotation: Annotation = {
    id: crypto.randomUUID(),
    imageId: s.activeImageId,
    classId: s.activeClassId,
    geometry: { kind: 'box', x: bbox[0], y: bbox[1], w: bbox[2], h: bbox[3] },
    bbox,
    attributes: defaultAttributes(cls?.attributes ?? []),
  }

  commandStack.execute({
    label: 'Add box',
    do: () => useStore.getState().addAnnotation(annotation),
    undo: () => useStore.getState().removeAnnotation(annotation.id),
  })
}
