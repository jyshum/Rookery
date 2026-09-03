import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Renderer, LAYER_ORDER, type LayerContexts, type LayerName } from './renderer'

/** Minimal stand-in for a 2D context: the renderer only clears and transforms. */
function mockCtx() {
  return {
    canvas: { width: 800, height: 600 },
    setTransform: vi.fn(),
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D
}

function mockContexts(): LayerContexts {
  return {
    image: mockCtx(),
    mask: mockCtx(),
    vector: mockCtx(),
    interaction: mockCtx(),
  }
}

/** Run every pending animation frame callback. */
let frames: FrameRequestCallback[] = []

beforeEach(() => {
  frames = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function tick() {
  const pending = frames
  frames = []
  for (const cb of pending) cb(0)
}

describe('Renderer dirty flags', () => {
  it('repaints only the layers that were invalidated', () => {
    const r = new Renderer(mockContexts(), 1)
    const drawn: LayerName[] = []
    for (const l of LAYER_ORDER) r.setDraw(l, () => drawn.push(l))

    r.invalidate('interaction')
    tick()

    expect(drawn).toEqual(['interaction'])
    expect(r.repaints).toEqual({ image: 0, mask: 0, vector: 0, interaction: 1 })
  })

  it('never repaints a clean layer', () => {
    const r = new Renderer(mockContexts(), 1)
    for (const l of LAYER_ORDER) r.setDraw(l, () => {})

    // simulate a rubber-band drag: 60 interaction invalidations, one frame each
    for (let i = 0; i < 60; i++) {
      r.invalidate('interaction')
      tick()
    }

    expect(r.repaints.interaction).toBe(60)
    expect(r.repaints.image).toBe(0)
    expect(r.repaints.vector).toBe(0)
    expect(r.repaints.mask).toBe(0)
  })

  it('coalesces many invalidations in one frame into a single repaint', () => {
    const r = new Renderer(mockContexts(), 1)
    let count = 0
    r.setDraw('interaction', () => { count++ })

    // pointer events arriving faster than the display refreshes
    for (let i = 0; i < 50; i++) r.invalidate('interaction')
    tick()

    expect(count).toBe(1)
  })

  it('draws layers in stacking order within a frame', () => {
    const r = new Renderer(mockContexts(), 1)
    const drawn: LayerName[] = []
    for (const l of LAYER_ORDER) r.setDraw(l, () => drawn.push(l))

    r.invalidate('interaction', 'image', 'vector', 'mask')
    tick()

    expect(drawn).toEqual(['image', 'mask', 'vector', 'interaction'])
  })

  it('invalidateAll repaints every layer once', () => {
    const r = new Renderer(mockContexts(), 1)
    for (const l of LAYER_ORDER) r.setDraw(l, () => {})
    r.invalidateAll()
    tick()
    expect(r.repaints).toEqual({ image: 1, mask: 1, vector: 1, interaction: 1 })
  })
})

describe('Renderer canvas handling', () => {
  it('clears in device pixels then restores the dpr baseline', () => {
    const ctxs = mockContexts()
    const r = new Renderer(ctxs, 2)
    r.setDraw('image', () => {})
    r.invalidate('image')
    tick()

    const ctx = ctxs.image as unknown as { setTransform: ReturnType<typeof vi.fn>; clearRect: ReturnType<typeof vi.fn> }
    expect(ctx.setTransform).toHaveBeenNthCalledWith(1, 1, 0, 0, 1, 0, 0)
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600)
    expect(ctx.setTransform).toHaveBeenNthCalledWith(2, 2, 0, 0, 2, 0, 0)
  })

  it('still clears a layer that has no draw function', () => {
    const ctxs = mockContexts()
    const r = new Renderer(ctxs, 1)
    r.invalidate('vector')
    tick()
    expect((ctxs.vector as unknown as { clearRect: ReturnType<typeof vi.fn> }).clearRect).toHaveBeenCalled()
  })
})

describe('Renderer lifecycle', () => {
  it('stops painting after destroy', () => {
    const r = new Renderer(mockContexts(), 1)
    let count = 0
    r.setDraw('image', () => { count++ })
    r.invalidate('image')
    r.destroy()
    tick()
    expect(count).toBe(0)
  })

  it('ignores invalidation after destroy', () => {
    const r = new Renderer(mockContexts(), 1)
    r.setDraw('image', () => {})
    r.destroy()
    r.invalidate('image')
    tick()
    expect(r.repaints.image).toBe(0)
  })
})
