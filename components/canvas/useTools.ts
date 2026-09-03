'use client'

import { useEffect, type RefObject } from 'react'
import type { Renderer, DrawFn } from '@/lib/canvas/renderer'
import type { Tool, ToolContext } from '@/lib/canvas/tools/types'
import { createBoxTool } from '@/lib/canvas/tools/box-tool'
import { screenToImage } from '@/lib/canvas/transform'
import { commandStack, useStore } from '@/lib/state/store'
import type { ToolId } from '@/lib/canvas/types'

/** Which tools are implemented so far. Polygon, brush and erase land next. */
function makeTool(id: ToolId): Tool | null {
  if (id === 'box') return createBoxTool()
  return null
}

/**
 * Routes pointer events to whichever tool is active.
 *
 * The dispatcher owns the plumbing every tool would otherwise duplicate:
 * screen-to-image conversion, pointer capture, and publishing a preview to the
 * interaction layer. Tools stay small and know nothing about canvases.
 */
export function useTools(
  ref: RefObject<HTMLElement | null>,
  rendererRef: RefObject<Renderer | null>,
  previewRef: RefObject<DrawFn | null>,
) {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    let tool = makeTool(useStore.getState().tool)
    let spaceDown = false

    const ctx: ToolContext = {
      toImage(e) {
        const rect = el.getBoundingClientRect()
        return screenToImage(
          useStore.getState().viewport,
          e.clientX - rect.left,
          e.clientY - rect.top,
        )
      },
      viewport: () => useStore.getState().viewport,
      setPreview(fn) {
        previewRef.current = fn
      },
      invalidate(...layers) {
        rendererRef.current?.invalidate(...layers)
      },
    }

    function applyCursor() {
      if (!el) return
      // panning wins: space-drag must work no matter which tool is selected
      el.style.cursor = spaceDown ? 'grab' : (tool?.cursor ?? 'default')
    }

    applyCursor()

    // ---- pointer routing --------------------------------------------------

    function onPointerDown(e: PointerEvent) {
      if (spaceDown || e.button === 1 || !tool || !el) return
      el.setPointerCapture(e.pointerId)
      tool.onPointerDown?.(e, ctx)
    }

    function onPointerMove(e: PointerEvent) {
      if (spaceDown || !tool) return
      tool.onPointerMove?.(e, ctx)
    }

    function onPointerUp(e: PointerEvent) {
      if (!tool || !el) return
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      tool.onPointerUp?.(e, ctx)
    }

    // ---- keyboard ---------------------------------------------------------

    function isTyping(target: EventTarget | null) {
      const node = target as HTMLElement | null
      if (!node) return false
      return /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName ?? '') || node.isContentEditable === true
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTyping(e.target)) return

      if (e.code === 'Space') {
        spaceDown = true
        tool?.cancel?.(ctx)
        applyCursor()
        return
      }

      if (e.key === 'Escape') {
        tool?.cancel?.(ctx)
        return
      }

      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) commandStack.redo()
        else commandStack.undo()
        return
      }

      if (mod) return

      const byKey: Record<string, ToolId> = {
        v: 'select', b: 'box', p: 'polygon', d: 'brush', e: 'erase',
      }
      const next = byKey[e.key.toLowerCase()]
      if (next) {
        e.preventDefault()
        useStore.getState().setTool(next)
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== 'Space') return
      spaceDown = false
      applyCursor()
    }

    // swap tools without leaving a half-finished gesture behind
    const unsubTool = useStore.subscribe((s) => {
      if (s.tool === tool?.id) return
      tool?.cancel?.(ctx)
      tool = makeTool(s.tool)
      applyCursor()
    })

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      unsubTool()
    }
  }, [ref, rendererRef, previewRef])
}
