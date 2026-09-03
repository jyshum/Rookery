import { describe, it, expect } from 'vitest'
import { MaskBuffer, type Stroke } from './mask-buffer'

function stroke(x: number, y: number, mode: 'paint' | 'erase' = 'paint'): Stroke {
  return { points: new Float32Array([x, y]), radius: 1, mode }
}

describe('MaskBuffer painting', () => {
  it('starts empty', () => {
    const b = new MaskBuffer(10, 10)
    expect(b.data.every((v) => v === 0)).toBe(true)
    expect(b.strokeCount).toBe(0)
  })

  it('paints a stroke into the bitmap', () => {
    const b = new MaskBuffer(10, 10)
    b.apply(stroke(5, 5))
    expect(b.data[5 * 10 + 5]).toBe(1)
    expect(b.strokeCount).toBe(1)
  })

  it('erases previously painted pixels', () => {
    const b = new MaskBuffer(10, 10)
    b.apply(stroke(5, 5))
    b.apply(stroke(5, 5, 'erase'))
    expect(b.data[5 * 10 + 5]).toBe(0)
  })

  it('fills gaps between pointer samples', () => {
    // one stroke from (0,5) to (9,5): every pixel between must be filled,
    // otherwise a fast drag leaves a dotted line
    const b = new MaskBuffer(10, 10)
    b.apply({ points: new Float32Array([0, 5, 9, 5]), radius: 0.5, mode: 'paint' })
    for (let x = 0; x <= 9; x++) {
      expect(b.data[5 * 10 + x]).toBe(1)
    }
  })

  it('clips stamps at the image edge without wrapping', () => {
    const b = new MaskBuffer(10, 10)
    b.apply({ points: new Float32Array([0, 0]), radius: 3, mode: 'paint' })
    // row 0 must not bleed into the end of row 0 via negative-x wraparound
    expect(b.data[0 * 10 + 9]).toBe(0)
    expect(b.data[0]).toBe(1)
  })
})

describe('MaskBuffer undo', () => {
  it('restores exact prior pixels on undo', () => {
    const b = new MaskBuffer(10, 10)
    b.apply(stroke(2, 2))
    const before = Array.from(b.data)
    b.apply(stroke(7, 7))
    b.undo()
    expect(Array.from(b.data)).toEqual(before)
    expect(b.strokeCount).toBe(1)
  })

  it('restores pixels an erase stroke removed', () => {
    const b = new MaskBuffer(10, 10)
    b.apply(stroke(5, 5))
    const before = Array.from(b.data)
    b.apply(stroke(5, 5, 'erase'))
    expect(b.data[5 * 10 + 5]).toBe(0)
    b.undo()
    expect(Array.from(b.data)).toEqual(before)
  })

  it('is a no-op on an empty buffer', () => {
    const b = new MaskBuffer(10, 10)
    expect(() => b.undo()).not.toThrow()
    expect(b.strokeCount).toBe(0)
  })
})

describe('MaskBuffer snapshots', () => {
  it('takes a snapshot every SNAPSHOT_INTERVAL strokes', () => {
    const b = new MaskBuffer(10, 10)
    for (let i = 0; i < 45; i++) b.apply(stroke(i % 10, 0))
    expect(b.snapshotIndices).toEqual([20, 40])
  })

  it('bounds replay cost to at most SNAPSHOT_INTERVAL strokes', () => {
    const b = new MaskBuffer(10, 10)
    for (let i = 0; i < 100; i++) b.apply(stroke(i % 10, 0))
    b.undo()
    expect(b.lastReplayCount).toBeLessThanOrEqual(MaskBuffer.SNAPSHOT_INTERVAL)
  })

  it('keeps replay bounded even after a very long session', () => {
    const b = new MaskBuffer(10, 10)
    for (let i = 0; i < 500; i++) b.apply(stroke(i % 10, 0))
    b.undo()
    // this is the whole point: cost does not grow with session length
    expect(b.lastReplayCount).toBeLessThanOrEqual(MaskBuffer.SNAPSHOT_INTERVAL)
  })

  it('keeps at most MAX_SNAPSHOTS snapshots', () => {
    const b = new MaskBuffer(10, 10)
    for (let i = 0; i < 400; i++) b.apply(stroke(i % 10, 0))
    expect(b.snapshotIndices.length).toBeLessThanOrEqual(MaskBuffer.MAX_SNAPSHOTS)
  })

  it('undo still reproduces correct pixels after snapshots are evicted', () => {
    const b = new MaskBuffer(10, 10)
    for (let i = 0; i < 300; i++) b.apply(stroke(i % 10, i % 10))
    const before = Array.from(b.data)
    b.apply(stroke(9, 0))
    b.undo()
    expect(Array.from(b.data)).toEqual(before)
  })

  it('produces identical pixels to a full replay with no snapshots', () => {
    // correctness guard: the snapshot shortcut must not change the result
    const withSnapshots = new MaskBuffer(16, 16)
    const strokes: Stroke[] = []
    for (let i = 0; i < 70; i++) {
      const s = stroke(i % 16, (i * 7) % 16, i % 5 === 0 ? 'erase' : 'paint')
      strokes.push(s)
      withSnapshots.apply(s)
    }
    withSnapshots.undo()

    const naive = new MaskBuffer(16, 16)
    for (const s of strokes.slice(0, -1)) naive.apply(s)

    expect(Array.from(withSnapshots.data)).toEqual(Array.from(naive.data))
  })
})

describe('MaskBuffer reset', () => {
  it('rebuilds from a supplied stroke history', () => {
    const a = new MaskBuffer(10, 10)
    a.apply(stroke(1, 1))
    a.apply(stroke(4, 4))

    const b = new MaskBuffer(10, 10)
    b.reset([stroke(1, 1), stroke(4, 4)])

    expect(Array.from(b.data)).toEqual(Array.from(a.data))
    expect(b.strokeCount).toBe(2)
  })
})

describe('MaskBuffer bounds', () => {
  it('returns a zero box when nothing is painted', () => {
    expect(new MaskBuffer(10, 10).bounds()).toEqual([0, 0, 0, 0])
  })

  it('wraps a single painted pixel', () => {
    const b = new MaskBuffer(10, 10)
    b.apply({ points: new Float32Array([5, 5]), radius: 0.4, mode: 'paint' })
    expect(b.bounds()).toEqual([5, 5, 1, 1])
  })

  it('wraps a painted span', () => {
    const b = new MaskBuffer(10, 10)
    b.apply({ points: new Float32Array([2, 3, 6, 3]), radius: 0.4, mode: 'paint' })
    const [x, y, w, h] = b.bounds()
    expect([x, y]).toEqual([2, 3])
    expect(w).toBe(5)
    expect(h).toBe(1)
  })
})

describe('MaskBuffer isEmpty', () => {
  it('is empty before painting', () => {
    expect(new MaskBuffer(8, 8).isEmpty()).toBe(true)
  })

  it('is not empty after painting', () => {
    const b = new MaskBuffer(8, 8)
    b.apply({ points: new Float32Array([4, 4]), radius: 1, mode: 'paint' })
    expect(b.isEmpty()).toBe(false)
  })

  it('is empty again once everything is erased', () => {
    const b = new MaskBuffer(8, 8)
    b.apply({ points: new Float32Array([4, 4]), radius: 1, mode: 'paint' })
    b.apply({ points: new Float32Array([4, 4]), radius: 3, mode: 'erase' })
    expect(b.isEmpty()).toBe(true)
  })
})

describe('MaskBuffer version', () => {
  it('changes on paint and on undo so caches can invalidate', () => {
    const b = new MaskBuffer(8, 8)
    const v0 = b.version
    b.apply({ points: new Float32Array([1, 1]), radius: 1, mode: 'paint' })
    const v1 = b.version
    b.undo()
    const v2 = b.version
    expect(v1).not.toBe(v0)
    expect(v2).not.toBe(v1)
  })
})
