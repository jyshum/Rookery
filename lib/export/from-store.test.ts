import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '@/lib/state/store'
import { exportInputFromState, exportFilename, LOCAL_PROJECT } from './from-store'
import { buildExport } from './build-export'
import type { Annotation, ImageAsset, LabelClass } from '@/lib/canvas/types'

const img = (id: string): ImageAsset => ({
  id, filename: `${id}.jpg`, source: 'BUNDLED', url: `/${id}.jpg`, width: 1600, height: 1067,
})

const cls: LabelClass = {
  id: 'c1', key: 'reagent_bottle', name: 'Reagent Bottle', color: '#38BDF8',
  attributes: [{ key: 'liquid_level', name: 'Liquid Level', type: 'PERCENT' }],
}

const ann = (id: string, imageId: string): Annotation => ({
  id, imageId, classId: 'c1',
  geometry: { kind: 'box', x: 1, y: 2, w: 3, h: 4 },
  bbox: [1, 2, 3, 4],
  attributes: { 'Liquid Level': 50 },
})

beforeEach(() => {
  useStore.getState().hydrate({
    images: [img('i1'), img('i2')],
    classes: [cls],
    annotations: [ann('a1', 'i1'), ann('a2', 'i2')],
  })
})

describe('exportInputFromState', () => {
  it('carries the project identity', () => {
    expect(exportInputFromState(useStore.getState()).project).toEqual(LOCAL_PROJECT)
  })

  it('includes every image, class, and annotation', () => {
    const input = exportInputFromState(useStore.getState())
    expect(input.images).toHaveLength(2)
    expect(input.classes).toHaveLength(1)
    expect(input.annotations).toHaveLength(2)
  })

  it('preserves insertion order so exports are stable between runs', () => {
    const input = exportInputFromState(useStore.getState())
    expect(input.images.map((i) => i.id)).toEqual(['i1', 'i2'])
    expect(input.annotations.map((a) => a.id)).toEqual(['a1', 'a2'])
  })

  it('includes images that have no annotations', () => {
    useStore.getState().hydrate({ images: [img('i1')], classes: [cls], annotations: [] })
    const doc = buildExport(exportInputFromState(useStore.getState()))
    expect(doc.images[0].annotations).toEqual([])
  })

  it('produces a document that survives JSON round-tripping', () => {
    const doc = buildExport(exportInputFromState(useStore.getState()))
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc)
  })

  it('reflects a class added at runtime', () => {
    useStore.getState().addClass({
      id: 'c2', key: 'cryo_vial', name: 'Cryo Vial', color: '#4ADE80',
      attributes: [{ key: 'barcode', name: 'Barcode', type: 'TEXT' }],
    })
    const doc = buildExport(exportInputFromState(useStore.getState()))
    expect(doc.classes.map((c) => c.id)).toContain('cryo_vial')
    expect(doc.classes.find((c) => c.id === 'cryo_vial')?.attributes).toEqual([
      { name: 'Barcode', type: 'text' },
    ])
  })
})

describe('exportFilename', () => {
  it('is dated', () => {
    expect(exportFilename(new Date('2026-09-03T12:00:00Z'))).toBe('rookery-export-2026-09-03.json')
  })
})
