'use client'

import { useEffect, type RefObject } from 'react'
import type { Renderer, DrawFn } from '@/lib/canvas/renderer'
import type { Tool, ToolContext } from '@/lib/canvas/tools/types'
import { createBoxTool } from '@/lib/canvas/tools/box-tool'
import { createSelectTool } from '@/lib/canvas/tools/select-tool'
import { createPolygonTool } from '@/lib/canvas/tools/polygon-tool'
import { createBrushTool } from '@/lib/canvas/tools/brush-tool'
import { SpatialIndex } from '@/lib/canvas/hit-test'
import { screenToImage } from '@/lib/canvas/transform'
import { commandStack, selectVisibleAnnotations, useStore } from '@/lib/state/store'
import { changeClassCommand, deleteAnnotationCommand } from '@/lib/state/annotation-commands'
import type { ToolId } from '@/lib/canvas/types'

function makeTool(id: ToolId): Tool | null {
  if (id === 'box') return createBoxTool()
  if (id === 'select') return createSelectTool()
  if (id === 'polygon') return createPolygonTool()
  if (id === 'brush') return createBrushTool('paint')
  if (id === 'erase') return createBrushTool('erase')
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

    // Spatial grid for hit testing, rebuilt whenever the shape list changes.
    // Rebuilding on change rather than per query means a hover test inspects
    // only the shapes near the cursor.
    let index = new SpatialIndex(1, 1)

    function rebuildIndex() {
      const s = useStore.getState()
      const img = s.activeImageId ? s.images[s.activeImageId] : null
      index = new SpatialIndex(img?.width ?? 1, img?.height ?? 1)
      index.rebuild(selectVisibleAnnotations(s))
    }

    rebuildIndex()

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
      hitTest(p) {
        return index.hitTest(p.x, p.y)
      },
    }

    function applyCursor() {
      if (!el) return
      // panning wins: space-drag must work no matter which tool is selected
      el.style.cursor = spaceDown ? 'grab' : (tool?.cursor ?? 'default')
    }

    applyCursor()

    // pointer routing

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

    // keyboard

    function isTyping(target: EventTarget | null) {
      const node = target as HTMLElement | null
      if (!node) return false
      return /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName ?? '') || node.isContentEditable === true
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTyping(e.target)) return
      // the export drawer owns the keyboard while it is open
      if (useStore.getState().exportOpen) return

      // the active tool sees keys first: a polygon in progress needs Enter and
      // Escape before any global shortcut claims them
      if (tool?.onKeyDown?.(e, ctx)) return

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

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selected = useStore.getState().selectedId
        if (selected) {
          e.preventDefault()
          deleteAnnotationCommand(selected)
          return
        }
      }

      // number keys pick a class by position, matching the panel's badges
      if (/^[1-9]$/.test(e.key)) {
        const s = useStore.getState()
        const id = s.classIds[Number(e.key) - 1]
        if (id) {
          e.preventDefault()
          if (s.selectedId) changeClassCommand(s.selectedId, id)
          else s.setActiveClass(id)
        }
        return
      }

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

    let lastAnnotations = useStore.getState().annotations
    let lastImageId = useStore.getState().activeImageId
    const unsubIndex = useStore.subscribe((s) => {
      if (s.annotations === lastAnnotations && s.activeImageId === lastImageId) return
      lastAnnotations = s.annotations
      lastImageId = s.activeImageId
      rebuildIndex()
    })

    // swap tools without leaving a half-finished gesture behind
    const unsubTool = useStore.subscribe((s) => {
      if (s.tool === tool?.id) return
      tool?.cancel?.(ctx)
      tool = makeTool(s.tool)
      applyCursor()
    })

    // tools use right click (polygon finishes with it), so suppress the menu
    const onContextMenu = (e: Event) => e.preventDefault()
    el.addEventListener('contextmenu', onContextMenu)
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      unsubTool()
      unsubIndex()
    }
  }, [ref, rendererRef, previewRef])
}
