import { describe, it, expect } from 'vitest'
import { simplify } from './simplify'

describe('simplify', () => {
  it('collapses collinear points to the two endpoints', () => {
    const pts = new Float32Array([0, 0, 10, 0, 20, 0, 30, 0, 40, 0])
    expect(Array.from(simplify(pts, 1))).toEqual([0, 0, 40, 0])
  })

  it('keeps a point that deviates beyond tolerance', () => {
    const pts = new Float32Array([0, 0, 10, 5, 20, 0])
    expect(Array.from(simplify(pts, 1))).toEqual([0, 0, 10, 5, 20, 0])
  })

  it('drops a point that deviates within tolerance', () => {
    const pts = new Float32Array([0, 0, 10, 0.5, 20, 0])
    expect(Array.from(simplify(pts, 1))).toEqual([0, 0, 20, 0])
  })

  it('returns input unchanged when there are fewer than three points', () => {
    const pts = new Float32Array([1, 2, 3, 4])
    expect(Array.from(simplify(pts, 1))).toEqual([1, 2, 3, 4])
  })

  it('always keeps the first and last point', () => {
    const pts = new Float32Array([0, 0, 1, 0, 2, 0, 3, 0])
    const out = simplify(pts, 100)
    expect(Array.from(out)).toEqual([0, 0, 3, 0])
  })

  it('meaningfully reduces a dense traced outline', () => {
    // 200 samples along a straight-ish line with sub-pixel jitter
    const pts = new Float32Array(400)
    for (let i = 0; i < 200; i++) {
      pts[i * 2] = i
      pts[i * 2 + 1] = (i % 2) * 0.1
    }
    expect(simplify(pts, 1).length / 2).toBeLessThan(10)
  })
})
