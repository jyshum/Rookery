import { describe, it, expect } from 'vitest'
import { BadRequest, parseAnnotation, parseSyncBody } from './validate'
import { annotationFromWire, type WireAnnotation } from './wire'
import { buildExport } from '@/lib/export/build-export'

/**
 * What validation keeps out of the database.
 *
 * Each case is a payload the sync route could receive. The first check is that
 * validation rejects it. The second shows what happens if it had been stored
 * anyway: the export either crashes or writes wrong data without complaint.
 *
 * The export reads every row in a project, so one crashing row takes down the
 * whole dataset download, not just the bad shape.
 */

const good = {
  id: 'a1',
  imageId: 'img',
  classId: 'cls',
  geometry: { kind: 'box', x: 10, y: 10, w: 20, h: 20 },
  bbox: [10, 10, 20, 20],
  attributes: {},
}

function exportWithout(raw: unknown) {
  return buildExport({
    project: { id: 'p', name: 'p' },
    classes: [],
    images: [{ id: 'img', filename: 'f.jpg', source: 'BUNDLED', url: '', width: 100, height: 100 }],
    annotations: [annotationFromWire(raw as WireAnnotation)],
  }).images[0].annotations[0]
}

const CRASHES_EXPORT: Record<string, unknown> = {
  'missing geometry': { ...good, geometry: undefined },
  'missing bbox': { ...good, bbox: undefined },
  'unknown shape kind': { ...good, geometry: { kind: 'circle', r: 5 } },
}

const CORRUPTS_EXPORT: Record<string, [unknown, (out: ReturnType<typeof exportWithout>) => void]> = {
  'null coordinate saved as 0': [
    { ...good, geometry: { kind: 'box', x: null, y: 10, w: 20, h: 20 } },
    (out) => expect(out.geometry.x).toBe(0),
  ],
  'string coordinate coerced silently': [
    { ...good, geometry: { kind: 'box', x: '10', y: 10, w: 20, h: 20 } },
    (out) => expect(out.geometry.x).toBe(10),
  ],
  'polygon with 2 points': [
    { ...good, geometry: { kind: 'polygon', points: [1, 2, 3, 4] } },
    (out) => expect(out.geometry.points).toHaveLength(2),
  ],
  'polygon with an odd coordinate count': [
    { ...good, geometry: { kind: 'polygon', points: [1, 2, 3, 4, 5, 6, 7] } },
    // NaN, which JSON writes as null
    (out) => expect((out.geometry.points as number[][]).at(-1)?.[1]).toBeNaN(),
  ],
  'polygon points as a string': [
    { ...good, geometry: { kind: 'polygon', points: 'abc' } },
    (out) => expect(out.geometry.points).toEqual([]),
  ],
  'mask with no run lengths': [
    { ...good, geometry: { kind: 'mask', rle: null, width: 100, height: 100 } },
    (out) => expect(out.geometry.rle).toBeNull(),
  ],
  'bbox with 2 numbers': [
    { ...good, bbox: [10, 10] },
    (out) => expect(out.bbox).toHaveLength(2),
  ],
  'attributes as an array': [
    { ...good, attributes: [1, 2] },
    (out) => expect(Array.isArray(out.attributes)).toBe(true),
  ],
}

describe('validation rejects payloads that would crash the export', () => {
  for (const [name, raw] of Object.entries(CRASHES_EXPORT)) {
    it(name, () => {
      expect(() => parseAnnotation(raw)).toThrow(BadRequest)
      expect(() => exportWithout(raw)).toThrow(TypeError)
    })
  }
})

describe('validation rejects payloads that would silently corrupt the export', () => {
  for (const [name, [raw, check]] of Object.entries(CORRUPTS_EXPORT)) {
    it(name, () => {
      expect(() => parseAnnotation(raw)).toThrow(BadRequest)
      check(exportWithout(raw))
    })
  }
})

describe('validation accepts real shapes', () => {
  it('box, polygon and mask', () => {
    expect(() => parseAnnotation(good)).not.toThrow()
    expect(() =>
      parseAnnotation({ ...good, geometry: { kind: 'polygon', points: [0, 0, 10, 0, 10, 10] } }),
    ).not.toThrow()
    expect(() =>
      parseAnnotation({ ...good, geometry: { kind: 'mask', rle: [5, 3, 2], width: 10, height: 1 } }),
    ).not.toThrow()
  })

  it('rejects the whole batch when one shape is bad', () => {
    const body = { upserts: [good, { ...good, id: 'a2', bbox: undefined }], deletes: [] }
    expect(() => parseSyncBody(body)).toThrow(BadRequest)
  })
})
