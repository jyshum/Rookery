import { describe, it, expect, beforeEach } from 'vitest'
import { commandStack, useStore } from './store'
import { setAttributeCommand, changeClassCommand, deleteAnnotationCommand } from './annotation-commands'
import type { Annotation, LabelClass } from '@/lib/canvas/types'

const bottle: LabelClass = {
  id: 'c_bottle', key: 'reagent_bottle', name: 'Reagent Bottle', color: '#38BDF8',
  attributes: [
    { key: 'liquid_level', name: 'Liquid Level', type: 'PERCENT', defaultValue: 100 },
    { key: 'state', name: 'State', type: 'ENUM', options: ['Open', 'Closed'], defaultValue: 'Closed' },
  ],
}

const hand: LabelClass = {
  id: 'c_hand', key: 'gloved_hand', name: 'Gloved Hand', color: '#F87171', attributes: [],
}

const ann: Annotation = {
  id: 'a1', imageId: 'i1', classId: 'c_bottle',
  geometry: { kind: 'box', x: 0, y: 0, w: 10, h: 10 },
  bbox: [0, 0, 10, 10],
  attributes: { 'Liquid Level': 100, State: 'Closed' },
}

beforeEach(() => {
  commandStack.clear()
  useStore.getState().hydrate({
    images: [{ id: 'i1', filename: 'a.jpg', source: 'BUNDLED', url: '/a.jpg', width: 100, height: 100 }],
    classes: [bottle, hand],
    annotations: [ann],
  })
})

describe('setAttributeCommand', () => {
  it('sets the value', () => {
    setAttributeCommand('a1', 'Liquid Level', 50, 100)
    expect(useStore.getState().annotations.a1.attributes['Liquid Level']).toBe(50)
  })

  it('restores the previous value on undo', () => {
    setAttributeCommand('a1', 'Liquid Level', 50, 100)
    commandStack.undo()
    expect(useStore.getState().annotations.a1.attributes['Liquid Level']).toBe(100)
  })

  it('removes the key on undo when there was no previous value', () => {
    setAttributeCommand('a1', 'Notes', 'chipped', undefined)
    expect(useStore.getState().annotations.a1.attributes.Notes).toBe('chipped')
    commandStack.undo()
    expect('Notes' in useStore.getState().annotations.a1.attributes).toBe(false)
  })

  it('does nothing when the value is unchanged', () => {
    setAttributeCommand('a1', 'Liquid Level', 100, 100)
    expect(commandStack.canUndo).toBe(false)
  })
})

describe('changeClassCommand', () => {
  it('reassigns the class', () => {
    changeClassCommand('a1', 'c_hand')
    expect(useStore.getState().annotations.a1.classId).toBe('c_hand')
  })

  it('replaces attributes with the new class defaults', () => {
    changeClassCommand('a1', 'c_hand')
    expect(useStore.getState().annotations.a1.attributes).toEqual({})
  })

  it('restores class and attributes on undo', () => {
    changeClassCommand('a1', 'c_hand')
    commandStack.undo()
    const a = useStore.getState().annotations.a1
    expect(a.classId).toBe('c_bottle')
    expect(a.attributes).toEqual({ 'Liquid Level': 100, State: 'Closed' })
  })

  it('does nothing when the class is already set', () => {
    changeClassCommand('a1', 'c_bottle')
    expect(commandStack.canUndo).toBe(false)
  })
})

describe('deleteAnnotationCommand', () => {
  it('removes the annotation', () => {
    deleteAnnotationCommand('a1')
    expect(useStore.getState().annotationIds).toEqual([])
  })

  it('puts it back on undo, attributes intact', () => {
    deleteAnnotationCommand('a1')
    commandStack.undo()
    const a = useStore.getState().annotations.a1
    expect(a).toBeDefined()
    expect(a.attributes).toEqual({ 'Liquid Level': 100, State: 'Closed' })
  })
})
