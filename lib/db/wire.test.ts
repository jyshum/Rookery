import { describe, it, expect } from 'vitest'
import {
  geometryToWire,
  geometryFromWire,
  annotationToWire,
  annotationFromWire,
  annotationTypeOf,
} from './wire'
import type { Annotation } from '@/lib/canvas/types'

describe('geometry wire format', () => {
  it('flattens polygon points for storage', () => {
    const wire = geometryToWire({ kind: 'polygon', points: new Float32Array([1, 2, 3, 4]) })
    expect(wire).toEqual({ kind: 'polygon', points: [1, 2, 3, 4] })
  })

  it('restores polygon points as a typed array', () => {
    const g = geometryFromWire({ kind: 'polygon', points: [1, 2, 3, 4] })
    expect(g.kind).toBe('polygon')
    if (g.kind === 'polygon') expect(g.points).toBeInstanceOf(Float32Array)
  })

  it('round-trips a polygon', () => {
    const original = { kind: 'polygon' as const, points: new Float32Array([5, 6, 7, 8]) }
    const back = geometryFromWire(geometryToWire(original))
    expect(back).toEqual(original)
  })

  it('round-trips a box unchanged', () => {
    const g = { kind: 'box' as const, x: 1, y: 2, w: 3, h: 4 }
    expect(geometryFromWire(geometryToWire(g))).toEqual(g)
  })

  it('round-trips a mask unchanged', () => {
    const g = { kind: 'mask' as const, rle: [3, 2, 4], width: 3, height: 3 }
    expect(geometryFromWire(geometryToWire(g))).toEqual(g)
  })

  it('survives JSON serialization, which is the whole point', () => {
    const original = { kind: 'polygon' as const, points: new Float32Array([1.5, 2.5]) }
    const json = JSON.parse(JSON.stringify(geometryToWire(original)))
    expect(geometryFromWire(json)).toEqual(original)
  })

  it('does not survive JSON without conversion', () => {
    // guards the reason this module exists: a Float32Array serializes to an
    // object with numeric keys, not an array
    const raw = JSON.parse(JSON.stringify({ points: new Float32Array([1, 2]) }))
    expect(Array.isArray(raw.points)).toBe(false)
  })
})

describe('annotation wire format', () => {
  const ann: Annotation = {
    id: 'a1', imageId: 'i1', classId: 'c1',
    geometry: { kind: 'polygon', points: new Float32Array([1, 2, 3, 4, 5, 6]) },
    bbox: [1, 2, 4, 4],
    attributes: { State: 'Open', 'Liquid Level': 50 },
  }

  it('round-trips through JSON', () => {
    const back = annotationFromWire(JSON.parse(JSON.stringify(annotationToWire(ann))))
    expect(back).toEqual(ann)
  })

  it('preserves attributes exactly', () => {
    expect(annotationToWire(ann).attributes).toEqual({ State: 'Open', 'Liquid Level': 50 })
  })
})

describe('annotationTypeOf', () => {
  it('maps each geometry to its enum', () => {
    expect(annotationTypeOf({ kind: 'box', x: 0, y: 0, w: 1, h: 1 })).toBe('BOX')
    expect(annotationTypeOf({ kind: 'polygon', points: new Float32Array() })).toBe('POLYGON')
    expect(annotationTypeOf({ kind: 'mask', rle: [], width: 1, height: 1 })).toBe('MASK')
  })
})
