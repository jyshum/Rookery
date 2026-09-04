import { encodeRLE } from '../rle'
import { simplify } from '../simplify'
import { getMaskBuffer, peekMaskBuffer } from '../mask-registry'
import type { Stroke } from '../mask-buffer'
import { inImageSpace } from '../layers/interaction-layer'
import { defaultAttributes } from '@/lib/classes'
import type { Tool, ToolContext } from './types'
import type { Annotation } from '../types'
import { commandStack, useStore } from '@/lib/state/store'

/** Sub-pixel wobble to discard from a recorded path, in image pixels. */
const SIMPLIFY_TOLERANCE = 0.75

/**
 * Brush and erase.
 *
 * Some things have no outline to click around. A spill has no corners, and
 * neither does liquid in a tube or a gloved hand halfway into frame. Polygon
 * suits rigid labware; brush suits everything else.
 *
 * The live stroke is drawn as a preview and only rasterized into the mask when
 * the pointer lifts. That makes one gesture one undo step, and it lets erase show
 * what is about to be removed, which an additive composite cannot.
 *
 * Freehand paths are simplified before storing. The pointer samples on a timer
 * rather than on curvature, so most of the points are jitter. Polygon vertices
 * are left alone because a person placed each one on purpose.
 */
export function createBrushTool(mode: 'paint' | 'erase'): Tool {
  let points: number[] = []
  let targetId: string | null = null
  let isNewAnnotation = false
  let cursorX = 0
  let cursorY = 0
  let hasCursor = false

  function radius(): number {
    return useStore.getState().brushSize / 2
  }

  function color(): string {
    const s = useStore.getState()
    const id = targetId ? s.annotations[targetId]?.classId : s.activeClassId
    return (id ? s.classes[id]?.color : null) ?? '#14B8A6'
  }

  /** Live stroke plus the ring showing brush size under the cursor. */
  function paint(ctx: ToolContext) {
    const v = ctx.viewport()
    const path = points.slice()
    const r = radius()
    const tint = color()
    const erasing = mode === 'erase'
    const cx = cursorX
    const cy = cursorY
    const showRing = hasCursor

    ctx.setPreview((c) =>
      inImageSpace(c, v, (cc, lw) => {
        if (path.length >= 2) {
          cc.lineCap = 'round'
          cc.lineJoin = 'round'
          cc.lineWidth = r * 2
          cc.strokeStyle = erasing ? '#0A0A0B' : tint
          cc.globalAlpha = erasing ? 0.65 : 0.5

          cc.beginPath()
          cc.moveTo(path[0], path[1])
          if (path.length === 2) cc.lineTo(path[0] + 0.01, path[1])
          for (let i = 2; i < path.length; i += 2) cc.lineTo(path[i], path[i + 1])
          cc.stroke()
        }

        if (showRing) {
          cc.globalAlpha = 1
          cc.lineWidth = lw
          cc.strokeStyle = erasing ? '#F87171' : tint
          cc.setLineDash(erasing ? [4 / v.scale, 3 / v.scale] : [])
          cc.beginPath()
          cc.arc(cx, cy, r, 0, Math.PI * 2)
          cc.stroke()
          cc.setLineDash([])
        }
      }),
    )
    ctx.invalidate('interaction')
  }

  return {
    id: mode === 'paint' ? 'brush' : 'erase',
    cursor: 'none',

    onPointerDown(e, ctx) {
      if (e.button !== 0) return
      const s = useStore.getState()
      if (!s.activeImageId) return

      const image = s.images[s.activeImageId]
      if (!image) return

      const selected = s.selectedId ? s.annotations[s.selectedId] : null
      const selectedIsMask = selected?.geometry.kind === 'mask'

      if (selectedIsMask) {
        // keep painting into whatever mask is selected
        targetId = selected.id
        isNewAnnotation = false
      } else if (mode === 'erase') {
        // nothing to erase from; erasing must not invent an annotation
        return
      } else {
        targetId = crypto.randomUUID()
        isNewAnnotation = true
        getMaskBuffer(targetId, image.width, image.height)
      }

      const p = ctx.toImage(e)
      points = [p.x, p.y]
      cursorX = p.x
      cursorY = p.y
      hasCursor = true
      paint(ctx)
    },

    onPointerMove(e, ctx) {
      const p = ctx.toImage(e)
      cursorX = p.x
      cursorY = p.y
      hasCursor = true

      if (targetId) {
        // coalesced events recover the samples between animation frames, so a
        // fast drag on a 120Hz pointer still produces a smooth path
        const batch = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e]
        for (const ev of batch) {
          const q = ctx.toImage(ev as PointerEvent)
          points.push(q.x, q.y)
        }
      }

      paint(ctx)
    },

    onPointerUp(_e, ctx) {
      const id = targetId
      const created = isNewAnnotation
      targetId = null
      isNewAnnotation = false

      const raw = points
      points = []

      if (!id || raw.length < 2) {
        paint(ctx)
        return
      }

      const stroke: Stroke = {
        points: simplify(new Float32Array(raw), SIMPLIFY_TOLERANCE),
        radius: radius(),
        mode,
      }

      commitStroke(id, stroke, created)
      paint(ctx)
      ctx.invalidate('mask')
    },

    onKeyDown(e, ctx) {
      if (e.key !== '[' && e.key !== ']') return
      e.preventDefault()
      const step = e.key === ']' ? 2 : -2
      useStore.getState().setBrushSize(useStore.getState().brushSize + step)
      paint(ctx)
      return true
    },

    cancel(ctx) {
      targetId = null
      isNewAnnotation = false
      points = []
      hasCursor = false
      ctx.setPreview(null)
      ctx.invalidate('interaction')
    },
  }
}

/**
 * Push one stroke through the command stack.
 *
 * The stroke is a few kilobytes of path. Undo
 * asks the buffer to rebuild from its nearest snapshot, which caps replay cost
 * regardless of how long the session has run.
 */
function commitStroke(id: string, stroke: Stroke, created: boolean): void {
  const s = useStore.getState()
  const image = s.activeImageId ? s.images[s.activeImageId] : null
  if (!image || !s.activeClassId) return

  const buffer = getMaskBuffer(id, image.width, image.height)
  const cls = s.classes[s.activeClassId]

  const annotation: Annotation = {
    id,
    imageId: image.id,
    classId: s.activeClassId,
    geometry: { kind: 'mask', rle: [], width: image.width, height: image.height },
    bbox: [0, 0, 0, 0],
    attributes: defaultAttributes(cls?.attributes ?? []),
  }

  /** Push the buffer's pixels back into the store as its serializable form. */
  const sync = () => {
    const buf = peekMaskBuffer(id)
    if (!buf) return
    useStore.getState().updateAnnotation(id, {
      geometry: { kind: 'mask', rle: encodeRLE(buf.data), width: buf.width, height: buf.height },
      bbox: buf.bounds(),
    })
  }

  commandStack.execute({
    label: stroke.mode === 'paint' ? 'Paint' : 'Erase',
    do: () => {
      buffer.apply(stroke)
      if (created) useStore.getState().addAnnotation(annotation)
      sync()
    },
    undo: () => {
      buffer.undo()
      if (created) useStore.getState().removeAnnotation(id)
      else sync()
    },
  })
}
