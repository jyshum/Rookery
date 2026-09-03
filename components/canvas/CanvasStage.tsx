'use client'

import { useEffect, useRef } from 'react'
import {
  Renderer,
  sizeCanvas,
  LAYER_ORDER,
  type DrawFn,
  type LayerContexts,
  type LayerName,
} from '@/lib/canvas/renderer'
import { drawImageLayer, loadBitmap } from '@/lib/canvas/layers/image-layer'
import { drawVectorLayer } from '@/lib/canvas/layers/vector-layer'
import { drawMaskLayer } from '@/lib/canvas/layers/mask-layer'
import { fitToContainer } from '@/lib/canvas/transform'
import { selectVisibleAnnotations, useStore } from '@/lib/state/store'
import { useViewportControls } from './useViewportControls'
import { useTools } from './useTools'

/**
 * Owns the four stacked canvases and the render loop.
 *
 * React mounts this component once and then stays out of the way. The render
 * loop reads the store through an imperative subscription rather than through
 * hooks, so a pointer move repaints a canvas without ever re-rendering React.
 * See spec 6.2.
 *
 * Only the top canvas receives pointer events; the three beneath it are inert.
 */
export function CanvasStage() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLCanvasElement>(null)
  const maskRef = useRef<HTMLCanvasElement>(null)
  const vectorRef = useRef<HTMLCanvasElement>(null)
  const interactionRef = useRef<HTMLCanvasElement>(null)

  const rendererRef = useRef<Renderer | null>(null)
  /** What the active tool wants drawn on the interaction layer, if anything. */
  const previewRef = useRef<DrawFn | null>(null)

  useViewportControls(wrapRef)
  useTools(wrapRef, rendererRef, previewRef)

  const bitmapRef = useRef<ImageBitmap | null>(null)
  const sizeRef = useRef({ w: 0, h: 0 })

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    let disposed = false

    /** (Re)build the renderer for the current container size. */
    function build() {
      if (!wrap || disposed) return
      const { width, height } = wrap.getBoundingClientRect()
      if (width === 0 || height === 0) return

      sizeRef.current = { w: width, h: height }
      const dpr = window.devicePixelRatio || 1

      const elements: Record<LayerName, HTMLCanvasElement | null> = {
        image: imageRef.current,
        mask: maskRef.current,
        vector: vectorRef.current,
        interaction: interactionRef.current,
      }

      const ctxs = {} as LayerContexts
      for (const name of LAYER_ORDER) {
        const el = elements[name]
        if (!el) return
        ctxs[name] = sizeCanvas(el, width, height, dpr)
      }

      rendererRef.current?.destroy()
      const renderer = new Renderer(ctxs, dpr)
      rendererRef.current = renderer

      renderer.setDraw('image', (ctx) => {
        drawImageLayer(ctx, bitmapRef.current, useStore.getState().viewport)
      })

      renderer.setDraw('mask', (ctx) => {
        const s = useStore.getState()
        drawMaskLayer(ctx, selectVisibleAnnotations(s), s.classes, s.viewport)
      })

      renderer.setDraw('vector', (ctx) => {
        const s = useStore.getState()
        drawVectorLayer(ctx, selectVisibleAnnotations(s), s.classes, s.viewport, s.selectedId)
      })

      renderer.setDraw('interaction', (ctx) => {
        previewRef.current?.(ctx)
      })

      fitActiveImage()
      renderer.invalidateAll()
    }

    /** Centre and scale the active image to the container. */
    function fitActiveImage() {
      const { activeImageId, images, setViewport } = useStore.getState()
      const img = activeImageId ? images[activeImageId] : null
      const { w, h } = sizeRef.current
      if (!img || w === 0 || h === 0) return
      setViewport(fitToContainer(img.width, img.height, w, h))
    }

    /** Load the bitmap for whichever image is active. */
    async function loadActive(url: string | null) {
      if (!url) {
        bitmapRef.current = null
        rendererRef.current?.invalidateAll()
        return
      }
      try {
        const bmp = await loadBitmap(url)
        if (disposed) {
          bmp.close()
          return
        }
        bitmapRef.current?.close()
        bitmapRef.current = bmp
        fitActiveImage()
        rendererRef.current?.invalidateAll()
      } catch (err) {
        console.error(err)
        bitmapRef.current = null
        rendererRef.current?.invalidateAll()
      }
    }

    build()

    const ro = new ResizeObserver(build)
    ro.observe(wrap)

    // imperative store subscriptions: these repaint canvases without any
    // React render happening at all
    let lastImageId = useStore.getState().activeImageId
    void loadActive(lastImageId ? useStore.getState().images[lastImageId]?.url : null)

    const unsubImage = useStore.subscribe((s) => {
      if (s.activeImageId === lastImageId) return
      lastImageId = s.activeImageId
      void loadActive(lastImageId ? s.images[lastImageId]?.url ?? null : null)
    })

    let lastViewport = useStore.getState().viewport
    const unsubViewport = useStore.subscribe((s) => {
      if (s.viewport === lastViewport) return
      lastViewport = s.viewport
      // everything is drawn under the viewport transform, so a pan or zoom is
      // the one case where every layer genuinely has to repaint
      rendererRef.current?.invalidateAll()
    })

    // committed shapes changed: only the vector layer is stale
    let lastAnnotations = useStore.getState().annotations
    let lastSelected = useStore.getState().selectedId
    const unsubVector = useStore.subscribe((s) => {
      if (s.annotations === lastAnnotations && s.selectedId === lastSelected) return
      lastAnnotations = s.annotations
      lastSelected = s.selectedId
      rendererRef.current?.invalidate('vector', 'mask')
    })

    return () => {
      disposed = true
      ro.disconnect()
      unsubImage()
      unsubViewport()
      unsubVector()
      rendererRef.current?.destroy()
      bitmapRef.current?.close()
      bitmapRef.current = null
    }
  }, [])

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-[#080d14]">
      <canvas ref={imageRef} className="pointer-events-none absolute inset-0" />
      <canvas ref={maskRef} className="pointer-events-none absolute inset-0" />
      <canvas ref={vectorRef} className="pointer-events-none absolute inset-0" />
      <canvas ref={interactionRef} className="absolute inset-0" />
    </div>
  )
}
