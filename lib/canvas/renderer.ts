export type LayerName = 'image' | 'mask' | 'vector' | 'interaction'

export const LAYER_ORDER: LayerName[] = ['image', 'mask', 'vector', 'interaction']

export type DrawFn = (ctx: CanvasRenderingContext2D) => void

export type LayerContexts = Record<LayerName, CanvasRenderingContext2D>

export type RepaintCounts = Record<LayerName, number>

/**
 * Dirty-flag renderer over four stacked canvases.
 *
 * ---------------------------------------------------------------------------
 * WHY FOUR CANVASES
 * ---------------------------------------------------------------------------
 * A canvas is one flat surface with no notion of layers, so changing anything
 * means clearing and redrawing all of it. On a single canvas, dragging a
 * polygon's rubber band would mean redrawing the photo and every finished
 * shape, sixty times a second, to move one line.
 *
 * The split is by LIFETIME, not by tool:
 *
 *   image        the photo               changes on pan, zoom, image switch
 *   mask         painted pixels          changes while a brush stroke is live
 *   vector       finished boxes/polygons changes when a shape is committed
 *   interaction  rubber band, cursor,    changes every frame, but the surface
 *                hover, drag preview     is nearly empty so it costs nothing
 *
 * With 30 polygons on screen, moving the rubber band on a shared canvas is
 * ~1,800 polygon redraws per second. On its own layer it is one line on an
 * empty surface, and the 30 polygons are never touched.
 *
 * Principle: temporary things change every frame, permanent things almost
 * never do. Sharing a canvas makes you pay the permanent cost at the temporary
 * frequency. See spec sections 5.2 and 5.3.
 *
 * ---------------------------------------------------------------------------
 * WHY rAF BATCHING
 * ---------------------------------------------------------------------------
 * Pointer events fire faster than the display refreshes, and on a 120Hz mouse
 * far faster. Painting per event does redundant work that is never shown.
 * Invalidation only marks a layer dirty; the actual repaint happens once per
 * animation frame, no matter how many events arrived.
 *
 * ---------------------------------------------------------------------------
 * TRANSFORM CONTRACT
 * ---------------------------------------------------------------------------
 * Every draw function receives a context already scaled for devicePixelRatio,
 * so it can work in CSS pixels and ignore retina entirely. Draw functions apply
 * the viewport with RELATIVE transforms (translate/scale) so they compose with
 * that baseline. They must never call setTransform, which would discard it.
 */
export class Renderer {
  private dirty = new Set<LayerName>()
  private draws = new Map<LayerName, DrawFn>()
  private frame: number | null = null
  private destroyed = false

  /**
   * Repaints per layer since construction.
   *
   * Exposed deliberately: it turns the layering claim into something
   * observable. During a rubber-band drag only `interaction` should climb.
   */
  readonly repaints: RepaintCounts = { image: 0, mask: 0, vector: 0, interaction: 0 }

  constructor(
    private readonly ctxs: LayerContexts,
    private readonly dpr: number,
  ) {}

  setDraw(layer: LayerName, fn: DrawFn): void {
    this.draws.set(layer, fn)
  }

  /** Mark layers as needing a repaint on the next animation frame. */
  invalidate(...layers: LayerName[]): void {
    if (this.destroyed) return
    for (const l of layers) this.dirty.add(l)
    this.schedule()
  }

  invalidateAll(): void {
    this.invalidate(...LAYER_ORDER)
  }

  private schedule(): void {
    if (this.frame !== null) return
    this.frame = requestAnimationFrame(() => {
      this.frame = null
      if (this.destroyed) return
      this.flush()
    })
  }

  private flush(): void {
    for (const layer of LAYER_ORDER) {
      if (!this.dirty.has(layer)) continue

      const draw = this.draws.get(layer)
      const ctx = this.ctxs[layer]
      if (!ctx) continue

      // clear in device pixels, then restore the dpr baseline for the draw fn
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)

      if (draw) draw(ctx)
      this.repaints[layer]++
    }
    this.dirty.clear()
  }

  destroy(): void {
    this.destroyed = true
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
    this.dirty.clear()
    this.draws.clear()
  }
}

/**
 * Size a canvas for the display's pixel density.
 *
 * A canvas has two sizes: its CSS box and its pixel buffer. Left equal, a
 * retina screen upscales the buffer and every hairline looks soft. Backing the
 * buffer at `cssSize * devicePixelRatio` and scaling the context by the same
 * factor keeps lines crisp while letting callers think in CSS pixels.
 */
export function sizeCanvas(
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
  dpr: number,
): CanvasRenderingContext2D {
  canvas.width = Math.max(1, Math.round(cssW * dpr))
  canvas.height = Math.max(1, Math.round(cssH * dpr))
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}
