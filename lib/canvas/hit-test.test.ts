import { describe, it, expect } from 'vitest'
import { SpatialIndex } from './hit-test'
import type { Annotation } from './types'

function boxAnn(id: string, x: number, y: number, w: number, h: number): Annotation {
  return {
    id, imageId: 'i1', classId: 'c1',
    geometry: { kind: 'box', x, y, w, h },
    bbox: [x, y, w, h],
    attributes: {},
  }
}

describe('SpatialIndex', () => {
  it('finds the annotation under a point', () => {
    const idx = new SpatialIndex(1000, 1000)
    idx.rebuild([boxAnn('a', 10, 10, 50, 50)])
    expect(idx.hitTest(20, 20)?.id).toBe('a')
  })

  it('returns null when nothing is under the point', () => {
    const idx = new SpatialIndex(1000, 1000)
    idx.rebuild([boxAnn('a', 10, 10, 50, 50)])
    expect(idx.hitTest(500, 500)).toBeNull()
  })

  it('returns the last added annotation when shapes overlap', () => {
    const idx = new SpatialIndex(1000, 1000)
    idx.rebuild([boxAnn('under', 0, 0, 100, 100), boxAnn('over', 0, 0, 100, 100)])
    expect(idx.hitTest(50, 50)?.id).toBe('over')
  })

  it('finds a shape that spans several grid cells', () => {
    const idx = new SpatialIndex(1000, 1000)
    idx.rebuild([boxAnn('big', 0, 0, 600, 600)])
    expect(idx.hitTest(550, 550)?.id).toBe('big')
  })

  it('respects polygon shape, not just its bounding box', () => {
    const idx = new SpatialIndex(1000, 1000)
    const tri: Annotation = {
      id: 't', imageId: 'i1', classId: 'c1',
      geometry: { kind: 'polygon', points: new Float32Array([0, 0, 100, 0, 0, 100]) },
      bbox: [0, 0, 100, 100],
      attributes: {},
    }
    idx.rebuild([tri])
    expect(idx.hitTest(10, 10)?.id).toBe('t')  // inside the triangle
    expect(idx.hitTest(90, 90)).toBeNull()     // inside the bbox, outside the triangle
  })

  it('respects mask pixels', () => {
    const idx = new SpatialIndex(100, 100)
    // 4x4 mask, only pixel (1,1) filled -> flat index 5
    const mask: Annotation = {
      id: 'm', imageId: 'i1', classId: 'c1',
      geometry: { kind: 'mask', rle: [5, 1, 10], width: 4, height: 4 },
      bbox: [0, 0, 4, 4],
      attributes: {},
    }
    idx.rebuild([mask])
    expect(idx.hitTest(1.5, 1.5)?.id).toBe('m')
    expect(idx.hitTest(3.5, 3.5)).toBeNull()
  })

  it('only tests candidates in the cell under the cursor', () => {
    const idx = new SpatialIndex(1000, 1000)
    const many = Array.from({ length: 200 }, (_, i) => boxAnn(`a${i}`, i * 4, 0, 3, 3))
    idx.rebuild(many)
    idx.hitTest(400, 400)
    expect(idx.lastCandidateCount).toBeLessThan(many.length)
  })

  it('handles points outside the image without throwing', () => {
    const idx = new SpatialIndex(100, 100)
    idx.rebuild([boxAnn('a', 0, 0, 10, 10)])
    expect(idx.hitTest(-50, -50)).toBeNull()
    expect(idx.hitTest(9999, 9999)).toBeNull()
  })
})
