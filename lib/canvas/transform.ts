import type { Point, Viewport } from './types'

/**
 * Viewport math for pan and zoom.
 *
 * Pan and zoom are applied as a single canvas transform matrix rather than by
 * recomputing every stored coordinate. Annotation geometry always lives in
 * image space, so zooming never touches the data.
 */

export function screenToImage(v: Viewport, sx: number, sy: number): Point {
  return { x: (sx - v.tx) / v.scale, y: (sy - v.ty) / v.scale }
}

export function imageToScreen(v: Viewport, ix: number, iy: number): Point {
  return { x: ix * v.scale + v.tx, y: iy * v.scale + v.ty }
}

/**
 * Zoom about a fixed screen point, so the pixel under the cursor stays under
 * the cursor. Without this, zooming drifts and feels broken.
 */
export function zoomAt(
  v: Viewport,
  sx: number,
  sy: number,
  factor: number,
  min: number,
  max: number,
): Viewport {
  const scale = Math.max(min, Math.min(max, v.scale * factor))

  // the image point currently under the cursor must map back to (sx, sy)
  const img = screenToImage(v, sx, sy)
  return { scale, tx: sx - img.x * scale, ty: sy - img.y * scale }
}

/** Scale an image to fit a container and center it on the unconstrained axis. */
export function fitToContainer(
  imgW: number,
  imgH: number,
  cw: number,
  ch: number,
): Viewport {
  const scale = Math.min(cw / imgW, ch / imgH)
  return {
    scale,
    tx: (cw - imgW * scale) / 2,
    ty: (ch - imgH * scale) / 2,
  }
}
