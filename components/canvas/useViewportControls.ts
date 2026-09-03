'use client'

import { useEffect, type RefObject } from 'react'
import { fitToContainer, zoomAt } from '@/lib/canvas/transform'
import { useStore } from '@/lib/state/store'

const MIN_SCALE = 0.05
const MAX_SCALE = 32

/** Wheel delta to zoom factor. Exponential so zooming feels even at any scale. */
const ZOOM_SENSITIVITY = 0.0015

/**
 * Pan and zoom, attached imperatively to the canvas container.
 *
 * Kept out of React's event system on purpose. `wheel` has to be registered
 * with `passive: false` to be preventable, which React's synthetic listeners do
 * not allow, and pan updates fire faster than a render cycle should run.
 *
 * Panning is space-drag or middle-mouse, matching Figma and Photoshop. Holding
 * a modifier to pan leaves the left button free for drawing tools, which is the
 * whole point: an annotator should never have to switch tools to reposition.
 */
export function useViewportControls(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    let spaceDown = false
    let panning = false
    let lastX = 0
    let lastY = 0

    function applyCursor() {
      if (!el) return
      el.style.cursor = panning ? 'grabbing' : spaceDown ? 'grab' : ''
    }

    function onWheel(e: WheelEvent) {
      if (!el) return
      e.preventDefault()

      const rect = el.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top

      // exponential so one notch feels the same whether zoomed in or out
      const factor = Math.exp(-e.deltaY * ZOOM_SENSITIVITY)

      const { viewport, setViewport } = useStore.getState()
      setViewport(zoomAt(viewport, sx, sy, factor, MIN_SCALE, MAX_SCALE))
    }

    /**
     * Re-fit the active image to the container.
     *
     * Cursor-anchored zoom is correct but unforgiving: zoom out with the
     * pointer near one edge and the image walks off into a corner. Every
     * editor answers this with a reset key, and without one an annotator can
     * strand themselves with no obvious way back.
     */
    function fitToView() {
      if (!el) return
      const { activeImageId, images, setViewport } = useStore.getState()
      const img = activeImageId ? images[activeImageId] : null
      if (!img) return
      const { width, height } = el.getBoundingClientRect()
      if (width === 0 || height === 0) return
      setViewport(fitToContainer(img.width, img.height, width, height))
    }

    function isTypingTarget(target: EventTarget | null) {
      const node = target as HTMLElement | null
      if (!node) return false
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName)) return true
      return node.isContentEditable
    }

    function onKeyDown(e: KeyboardEvent) {
      // never steal keys from a text field
      if (isTypingTarget(e.target)) return

      if ((e.key === 'f' || e.key === '0') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        fitToView()
        return
      }

      if (e.code !== 'Space' || e.repeat) return
      spaceDown = true
      e.preventDefault() // stop the page scrolling
      applyCursor()
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== 'Space') return
      spaceDown = false
      applyCursor()
    }

    function onPointerDown(e: PointerEvent) {
      if (!el) return
      const wantsPan = spaceDown || e.button === 1
      if (!wantsPan) return

      e.preventDefault()
      panning = true
      lastX = e.clientX
      lastY = e.clientY
      el.setPointerCapture(e.pointerId)
      applyCursor()
    }

    function onPointerMove(e: PointerEvent) {
      if (!panning) return

      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY

      const { viewport, setViewport } = useStore.getState()
      setViewport({ ...viewport, tx: viewport.tx + dx, ty: viewport.ty + dy })
    }

    function onPointerUp(e: PointerEvent) {
      if (!panning || !el) return
      panning = false
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      applyCursor()
    }

    // wheel must be non-passive so preventDefault stops the page from scrolling
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [ref])
}
