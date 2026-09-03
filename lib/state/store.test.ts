import { describe, it, expect, beforeEach } from 'vitest'
import {
  useStore,
  selectVisibleAnnotations,
  selectSelectedAnnotation,
} from './store'
import type { Annotation, ImageAsset, LabelClass } from '@/lib/canvas/types'

function ann(id: string, imageId = 'i1'): Annotation {
  return {
    id, imageId, classId: 'c1',
    geometry: { kind: 'box', x: 0, y: 0, w: 10, h: 10 },
    bbox: [0, 0, 10, 10],
    attributes: {},
  }
}

const img = (id: string): ImageAsset => ({
  id, filename: `${id}.jpg`, source: 'BUNDLED',
  url: `/samples/${id}.jpg`, width: 100, height: 100,
})

const cls: LabelClass = {
  id: 'c1', key: 'bottle', name: 'Bottle', color: '#fff', attributes: [],
}

beforeEach(() => {
  useStore.getState().hydrate({ images: [], classes: [], annotations: [] })
})

describe('annotations', () => {
  it('adds an annotation and selects it', () => {
    useStore.getState().addAnnotation(ann('a1'))
    const s = useStore.getState()
    expect(s.annotationIds).toEqual(['a1'])
    expect(s.selectedId).toBe('a1')
  })

  it('removes an annotation from both the record and the id list', () => {
    const st = useStore.getState()
    st.addAnnotation(ann('a1'))
    st.addAnnotation(ann('a2'))
    useStore.getState().removeAnnotation('a1')
    const s = useStore.getState()
    expect(s.annotationIds).toEqual(['a2'])
    expect(s.annotations.a1).toBeUndefined()
  })

  it('clears the selection when the selected annotation is removed', () => {
    useStore.getState().addAnnotation(ann('a1'))
    useStore.getState().removeAnnotation('a1')
    expect(useStore.getState().selectedId).toBeNull()
  })

  it('keeps the selection when a different annotation is removed', () => {
    useStore.getState().addAnnotation(ann('a1'))
    useStore.getState().addAnnotation(ann('a2'))
    useStore.getState().removeAnnotation('a1')
    expect(useStore.getState().selectedId).toBe('a2')
  })

  it('ignores an update to a missing annotation instead of creating one', () => {
    useStore.getState().updateAnnotation('nope', { bbox: [1, 1, 1, 1] })
    expect(useStore.getState().annotationIds).toEqual([])
  })

  it('leaves other annotations untouched when one is edited', () => {
    useStore.getState().addAnnotation(ann('a1'))
    useStore.getState().addAnnotation(ann('a2'))
    const before = useStore.getState().annotations.a1
    useStore.getState().updateAnnotation('a2', { bbox: [5, 5, 5, 5] })
    // identity preserved: a subscriber reading only a1 should not be invalidated
    expect(useStore.getState().annotations.a1).toBe(before)
  })
})

describe('attributes', () => {
  it('sets a value without dropping the others', () => {
    useStore.getState().addAnnotation(ann('a1'))
    useStore.getState().setAttribute('a1', 'State', 'Open')
    useStore.getState().setAttribute('a1', 'Liquid Level', 50)
    expect(useStore.getState().annotations.a1.attributes).toEqual({
      State: 'Open',
      'Liquid Level': 50,
    })
  })

  it('overwrites an existing value', () => {
    useStore.getState().addAnnotation(ann('a1'))
    useStore.getState().setAttribute('a1', 'State', 'Open')
    useStore.getState().setAttribute('a1', 'State', 'Closed')
    expect(useStore.getState().annotations.a1.attributes.State).toBe('Closed')
  })
})

describe('images and selection', () => {
  it('clears the selection when switching image', () => {
    useStore.getState().hydrate({ images: [img('i1'), img('i2')], classes: [cls], annotations: [ann('a1')] })
    useStore.getState().setSelected('a1')
    useStore.getState().setActiveImage('i2')
    expect(useStore.getState().selectedId).toBeNull()
  })

  it('does not add the same image twice', () => {
    useStore.getState().addImage(img('i1'))
    useStore.getState().addImage(img('i1'))
    expect(useStore.getState().imageIds).toEqual(['i1'])
  })
})

describe('selectors', () => {
  it('returns only annotations on the active image', () => {
    useStore.getState().hydrate({
      images: [img('i1'), img('i2')],
      classes: [cls],
      annotations: [ann('a1', 'i1'), ann('a2', 'i2'), ann('a3', 'i1')],
    })
    expect(selectVisibleAnnotations(useStore.getState()).map((a) => a.id)).toEqual(['a1', 'a3'])
  })

  it('returns null for the selected annotation when nothing is selected', () => {
    expect(selectSelectedAnnotation(useStore.getState())).toBeNull()
  })
})

describe('brush size', () => {
  it('clamps to the allowed range', () => {
    useStore.getState().setBrushSize(0)
    expect(useStore.getState().brushSize).toBe(1)
    useStore.getState().setBrushSize(9999)
    expect(useStore.getState().brushSize).toBe(200)
  })
})
