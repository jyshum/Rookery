import { describe, it, expect } from 'vitest'
import { buildExport } from './build-export'
import type { Annotation, ImageAsset, LabelClass } from '@/lib/canvas/types'

const cls: LabelClass = {
  id: 'c1', key: 'reagent_bottle', name: 'Reagent Bottle', color: '#14B8A6',
  attributes: [
    { key: 'liquid_level', name: 'Liquid Level', type: 'PERCENT' },
    { key: 'state', name: 'State', type: 'ENUM', options: ['Open', 'Closed'] },
  ],
}

const img: ImageAsset = {
  id: 'i1', filename: 'bench_01.jpg', source: 'BUNDLED',
  url: '/samples/bench_01.jpg', width: 1920, height: 1080,
}

const poly: Annotation = {
  id: 'a1', imageId: 'i1', classId: 'c1',
  geometry: { kind: 'polygon', points: new Float32Array([412, 220, 498, 220, 501, 390, 409, 388]) },
  bbox: [409, 220, 92, 170],
  attributes: { 'Liquid Level': 50, State: 'Open' },
}

const base = { project: { id: 'p1', name: 'Bench Set A' }, classes: [cls], images: [img] }

describe('buildExport', () => {
  it('includes schema version and project name', () => {
    const out = buildExport({ ...base, annotations: [poly] })
    expect(out.schema_version).toBe('1.0')
    expect(out.project.name).toBe('Bench Set A')
  })

  it('stamps an ISO timestamp', () => {
    const out = buildExport({ ...base, annotations: [] })
    expect(() => new Date(out.exported_at).toISOString()).not.toThrow()
  })

  it('emits class definitions with their attribute schemas', () => {
    const out = buildExport({ ...base, annotations: [] })
    expect(out.classes[0].id).toBe('reagent_bottle')
    expect(out.classes[0].attributes).toEqual([
      { name: 'Liquid Level', type: 'percent' },
      { name: 'State', type: 'enum', options: ['Open', 'Closed'] },
    ])
  })

  it('omits the options key for non-enum attributes', () => {
    const out = buildExport({ ...base, annotations: [] })
    expect('options' in out.classes[0].attributes[0]).toBe(false)
  })

  it('nests annotations under their image', () => {
    const out = buildExport({ ...base, annotations: [poly] })
    expect(out.images[0].annotations).toHaveLength(1)
    expect(out.images[0].annotations[0].class).toBe('reagent_bottle')
  })

  it('serializes polygon points as nested number pairs', () => {
    const out = buildExport({ ...base, annotations: [poly] })
    expect(out.images[0].annotations[0].geometry).toEqual({
      points: [[412, 220], [498, 220], [501, 390], [409, 388]],
    })
  })

  it('serializes a box as x, y, w, h', () => {
    const boxAnn: Annotation = {
      id: 'a2', imageId: 'i1', classId: 'c1',
      geometry: { kind: 'box', x: 10, y: 20, w: 30, h: 40 },
      bbox: [10, 20, 30, 40], attributes: {},
    }
    const out = buildExport({ ...base, annotations: [boxAnn] })
    expect(out.images[0].annotations[0].geometry).toEqual({ x: 10, y: 20, w: 30, h: 40 })
  })

  it('serializes a mask as rle with dimensions', () => {
    const maskAnn: Annotation = {
      id: 'a3', imageId: 'i1', classId: 'c1',
      geometry: { kind: 'mask', rle: [3, 2, 4], width: 3, height: 3 },
      bbox: [0, 1, 2, 1], attributes: {},
    }
    const out = buildExport({ ...base, annotations: [maskAnn] })
    expect(out.images[0].annotations[0].geometry).toEqual({ rle: [3, 2, 4], width: 3, height: 3 })
  })

  it('always emits a bbox regardless of shape type', () => {
    const out = buildExport({ ...base, annotations: [poly] })
    expect(out.images[0].annotations[0].bbox).toEqual([409, 220, 92, 170])
  })

  it('emits an empty annotations array for an untouched image', () => {
    const out = buildExport({ ...base, annotations: [] })
    expect(out.images[0].annotations).toEqual([])
  })

  it('keeps annotations with the right image when there are several', () => {
    const img2: ImageAsset = { ...img, id: 'i2', filename: 'bench_02.jpg' }
    const other: Annotation = { ...poly, id: 'a9', imageId: 'i2' }
    const out = buildExport({ ...base, images: [img, img2], annotations: [poly, other] })
    expect(out.images[0].annotations.map((a) => a.id)).toEqual(['a1'])
    expect(out.images[1].annotations.map((a) => a.id)).toEqual(['a9'])
  })

  it('produces output that survives JSON round-tripping', () => {
    const out = buildExport({ ...base, annotations: [poly] })
    expect(JSON.parse(JSON.stringify(out))).toEqual(out)
  })
})
