export type LayerName = 'image' | 'mask' | 'vector' | 'interaction'

export const LAYER_ORDER: LayerName[] = ['image', 'mask', 'vector', 'interaction']

export type DrawFn = (ctx: CanvasRenderingContext2D) => void

export type LayerContexts = Record<LayerName, CanvasRenderingContext2D>

export type RepaintCounts = Record<LayerName, number>

/**
 * Draws the four stacked canvases, repainting only what changed.
 *
 * Layers are split by how long their contents live:
 *
 *   image        the photo               pan, zoom, image switch
 *   mask         painted pixels          a committed stroke
 *   vector       finished shapes         a shape added, moved, deleted
 *   interaction  previews and cursors    every frame, on an empty surface
 *
 * A canvas has no layers of its own, so any change means clearing and redrawing
 * everything on it. Keeping previews separate means dragging a polygon's rubber
 * band never touches the photo or the 30 shapes already drawn.
 *
 * Invalidation only marks a layer dirty. The repaint happens once per animation
 * frame however many events arrived, so a 120Hz pointer cannot cause 120 paints.
 *
 * Draw functions get a context already scaled for devicePixelRatio, so they work
 * in CSS pixels. They apply the viewport with translate/scale, never setTransform,
 * which would discard that scaling.
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
