import { describe, it, expect } from 'vitest'
import { formatExport } from './format'

describe('formatExport', () => {
  it('keeps object structure indented and readable', () => {
    const out = formatExport({ a: 1, b: { c: 'x' } })
    expect(out).toBe('{\n  "a": 1,\n  "b": {\n    "c": "x"\n  }\n}')
  })

  it('collapses a run-length array onto one line', () => {
    const out = formatExport({ rle: [3, 2, 4, 100] })
    expect(out).toBe('{\n  "rle": [3, 2, 4, 100]\n}')
  })

  it('collapses polygon point pairs onto one line', () => {
    const out = formatExport({ points: [[1, 2], [3, 4]] })
    expect(out).toBe('{\n  "points": [[1, 2], [3, 4]]\n}')
  })

  it('still indents arrays of objects', () => {
    const out = formatExport({ images: [{ id: 'a' }] })
    expect(out).toContain('"images": [\n')
    expect(out).toContain('"id": "a"')
  })

  it('handles empty arrays and objects', () => {
    expect(formatExport({ a: [], b: {} })).toBe('{\n  "a": [],\n  "b": {}\n}')
  })

  it('parses back to exactly the same value', () => {
    const doc = {
      schema_version: '1.0',
      images: [
        {
          annotations: [
            { geometry: { rle: [1, 2, 3] }, bbox: [1, 2, 3, 4] },
            { geometry: { points: [[1, 2], [3, 4], [5, 6]] } },
          ],
        },
      ],
    }
    expect(JSON.parse(formatExport(doc))).toEqual(doc)
  })

  it('is dramatically shorter than plain pretty-printing for masks', () => {
    const doc = { rle: Array.from({ length: 800 }, (_, i) => i) }
    const ours = formatExport(doc).split('\n').length
    const plain = JSON.stringify(doc, null, 2).split('\n').length
    expect(ours).toBe(3)
    expect(plain).toBeGreaterThan(800)
  })
})

describe('short primitive arrays', () => {
  it('inlines a short list of strings', () => {
    expect(formatExport({ options: ['Open', 'Closed'] })).toBe(
      '{\n  "options": ["Open", "Closed"]\n}',
    )
  })

  it('still breaks a long list of strings across lines', () => {
    const many = Array.from({ length: 20 }, (_, i) => `option-number-${i}`)
    expect(formatExport({ options: many }).split('\n').length).toBeGreaterThan(5)
  })
})
