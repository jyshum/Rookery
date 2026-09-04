import { distToSegment } from './geometry'

/**
 * Ramer-Douglas-Peucker.
 *
 * A traced outline captures far more points than the shape needs, because the
 * pointer samples on a timer rather than on curvature. Dropping points that sit
 * within `tolerance` of the line between their neighbours shrinks the payload,
 * the render cost, and the export, with no visible change.
 *
 * Iterative rather than recursive so a long freehand stroke cannot blow the
 * call stack.
 */
export function simplify(pts: Float32Array, tolerance: number): Float32Array {
  const n = pts.length / 2
  if (n < 3) return pts

  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[n - 1] = 1

  const stack: Array<[number, number]> = [[0, n - 1]]

  while (stack.length) {
    const [first, last] = stack.pop()!
    let maxDist = 0
    let index = -1

    for (let i = first + 1; i < last; i++) {
      const d = distToSegment(
        pts[i * 2],
        pts[i * 2 + 1],
        pts[first * 2],
        pts[first * 2 + 1],
        pts[last * 2],
        pts[last * 2 + 1],
      )
      if (d > maxDist) {
        maxDist = d
        index = i
      }
    }

    if (maxDist > tolerance && index !== -1) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }

  const out: number[] = []
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1])
  }
  return new Float32Array(out)
}
