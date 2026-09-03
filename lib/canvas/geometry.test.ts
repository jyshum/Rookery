import { describe, it, expect } from 'vitest'
import { bboxFromPoints, bboxFromBox, pointInPolygon, distToSegment } from './geometry'

describe('bboxFromPoints', () => {
  it('returns x, y, w, h covering all points', () => {
    const pts = new Float32Array([10, 20, 50, 20, 50, 80, 10, 80])
    expect(bboxFromPoints(pts)).toEqual([10, 20, 40, 60])
  })

  it('handles a single point as a zero-size box', () => {
    expect(bboxFromPoints(new Float32Array([5, 7]))).toEqual([5, 7, 0, 0])
  })
})

describe('bboxFromBox', () => {
  it('normalizes negative width and height', () => {
    expect(bboxFromBox(50, 80, -40, -60)).toEqual([10, 20, 40, 60])
  })

  it('leaves an already-positive box alone', () => {
    expect(bboxFromBox(10, 20, 40, 60)).toEqual([10, 20, 40, 60])
  })
})

describe('pointInPolygon', () => {
  const square = new Float32Array([0, 0, 100, 0, 100, 100, 0, 100])

  it('returns true for an interior point', () => {
    expect(pointInPolygon(50, 50, square)).toBe(true)
  })

  it('returns false for an exterior point', () => {
    expect(pointInPolygon(150, 50, square)).toBe(false)
  })

  it('handles a concave polygon', () => {
    // an L shape
    const L = new Float32Array([0, 0, 100, 0, 100, 40, 40, 40, 40, 100, 0, 100])
    expect(pointInPolygon(70, 70, L)).toBe(false)
    expect(pointInPolygon(20, 70, L)).toBe(true)
  })
})

describe('distToSegment', () => {
  it('returns perpendicular distance when the foot is on the segment', () => {
    expect(distToSegment(50, 30, 0, 0, 100, 0)).toBeCloseTo(30)
  })

  it('returns endpoint distance when the foot is past the segment', () => {
    expect(distToSegment(-30, 0, 0, 0, 100, 0)).toBeCloseTo(30)
  })

  it('handles a zero-length segment', () => {
    expect(distToSegment(3, 4, 0, 0, 0, 0)).toBeCloseTo(5)
  })
})
