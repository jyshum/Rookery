import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ClassPanel } from './ClassPanel'
import { AttributePanel } from './AttributePanel'
import { commandStack, useStore } from '@/lib/state/store'
import { buildExport } from '@/lib/export/build-export'
import type { AttrType } from '@/lib/canvas/types'

/**
 * A new label with every attribute type, added through the UI alone.
 *
 * The test does what a person would: opens the class form, types a name, adds
 * one attribute of each type, and saves. Then it draws nothing new in code and
 * checks the attribute panel shows the right control for each one, and that the
 * export carries the schema. No file in the app mentions "Sample Tube" or any of
 * its fields.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  commandStack.clear()
  useStore.getState().hydrate({
    images: [{ id: 'i1', filename: 'a.jpg', source: 'BUNDLED', url: '/a.jpg', width: 100, height: 100 }],
    classes: [],
    annotations: [],
  })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

/** Set a controlled input's value the way React sees a real keystroke. */
function type(el: Element, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}

function click(el: Element) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

function button(text: string): HTMLButtonElement {
  const b = [...host.querySelectorAll('button')].find((x) => x.textContent?.includes(text))
  if (!b) throw new Error(`no button "${text}"`)
  return b
}

const FIELDS: Array<{ name: string; type: AttrType; options?: string }> = [
  { name: 'Barcode', type: 'TEXT' },
  { name: 'Rack Slot', type: 'NUMBER' },
  { name: 'Fill', type: 'PERCENT' },
  { name: 'Cap', type: 'ENUM', options: 'On, Off' },
  { name: 'Labelled', type: 'BOOLEAN' },
]

describe('adding a label with no code change', () => {
  it('creates a class with all 5 attribute types from the form and renders a control for each', () => {
    act(() => root.render(<ClassPanel />))

    act(() => click(host.querySelector('button[title="New class"]')!))
    act(() => type(host.querySelector('input[placeholder="Class name"]')!, 'Sample Tube'))

    for (const [i, f] of FIELDS.entries()) {
      act(() => click(button('+ Attribute')))
      const rows = host.querySelectorAll('input[placeholder="Attribute"]')
      act(() => type(rows[i], f.name))
      act(() => type(host.querySelectorAll('select')[i], f.type))
      if (f.options) {
        act(() => type(host.querySelector('input[placeholder="Open, Closed"]')!, f.options!))
      }
    }

    act(() => click(button('Create class')))

    const cls = Object.values(useStore.getState().classes)[0]
    expect(cls.name).toBe('Sample Tube')
    expect(cls.attributes.map((a) => a.type)).toEqual(FIELDS.map((f) => f.type))
    expect(cls.attributes.find((a) => a.type === 'ENUM')?.options).toEqual(['On', 'Off'])

    // draw a shape with it, then open the attribute panel
    act(() => {
      useStore.getState().addAnnotation({
        id: 'a1', imageId: 'i1', classId: cls.id,
        geometry: { kind: 'box', x: 0, y: 0, w: 10, h: 10 },
        bbox: [0, 0, 10, 10],
        attributes: {},
      })
      root.render(<AttributePanel />)
    })

    expect(host.querySelectorAll('input[type="text"]')).toHaveLength(1)
    expect(host.querySelectorAll('input[type="number"]')).toHaveLength(1)
    expect(host.querySelectorAll('input[type="range"]')).toHaveLength(1)
    expect(host.querySelectorAll('input[type="checkbox"]')).toHaveLength(1)
    const options = [...host.querySelectorAll('select option')].map((o) => o.textContent)
    expect(options).toEqual(['—', 'On', 'Off'])

    // and the dataset declares it
    const s = useStore.getState()
    const doc = buildExport({
      project: { id: 'p', name: 'p' },
      classes: Object.values(s.classes),
      images: Object.values(s.images),
      annotations: Object.values(s.annotations),
    })
    expect(doc.classes[0].attributes.map((a) => a.type)).toEqual(['text', 'number', 'percent', 'enum', 'boolean'])
  })
})
