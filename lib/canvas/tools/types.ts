import type { DrawFn, LayerName } from '../renderer'
import type { Point, Viewport } from '../types'

/**
 * What a tool is allowed to touch.
 *
 * Tools never reach for canvases or the store directly. They convert pointer
 * positions to image space, publish a preview, and commit through the command
 * stack. Keeping that surface narrow is what lets four tools coexist without
 * knowing about each other.
 */
export interface ToolContext {
  /** Pointer position in image space, accounting for pan and zoom. */
  toImage(e: PointerEvent): Point
  viewport(): Viewport
  /** Replace what the interaction layer draws. Pass null to clear it. */
  setPreview(fn: DrawFn | null): void
  invalidate(...layers: LayerName[]): void
}

export interface Tool {
  readonly id: string
  readonly cursor?: string
  onPointerDown?(e: PointerEvent, ctx: ToolContext): void
  onPointerMove?(e: PointerEvent, ctx: ToolContext): void
  onPointerUp?(e: PointerEvent, ctx: ToolContext): void
  /** Escape, or switching tools mid-gesture. */
  cancel?(ctx: ToolContext): void
}
