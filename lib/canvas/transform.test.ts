import { describe, it, expect } from 'vitest'
import { screenToImage, imageToScreen, zoomAt, fitToContainer } from './transform'

const v = { scale: 2, tx: 100, ty: 50 }

describe('coordinate conversion', () => {
  it('converts screen to image', () => {
    expect(screenToImage(v, 300, 250)).toEqual({ x: 100, y: 100 })
  })

  it('round-trips back to the same screen point', () => {
    const img = screenToImage(v, 300, 250)
    expect(imageToScreen(v, img.x, img.y)).toEqual({ x: 300, y: 250 })
  })
})

describe('zoomAt', () => {
  it('keeps the anchor point pinned under the cursor', () => {
    const before = screenToImage(v, 300, 250)
    const next = zoomAt(v, 300, 250, 1.5, 0.1, 20)
    const after = screenToImage(next, 300, 250)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('keeps the anchor pinned when zooming out too', () => {
    const before = screenToImage(v, 42, 900)
    const next = zoomAt(v, 42, 900, 0.4, 0.1, 20)
    const after = screenToImage(next, 42, 900)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('clamps to the maximum scale', () => {
    expect(zoomAt(v, 0, 0, 100, 0.1, 8).scale).toBe(8)
  })

  it('clamps to the minimum scale', () => {
    expect(zoomAt(v, 0, 0, 0.001, 0.25, 8).scale).toBe(0.25)
  })
})

describe('fitToContainer', () => {
  it('scales to fit and centers on the constrained axis', () => {
    const r = fitToContainer(1000, 500, 400, 400)
    expect(r.scale).toBeCloseTo(0.4)
    expect(r.tx).toBeCloseTo(0)
    expect(r.ty).toBeCloseTo(100)
  })

  it('fits a tall image by height', () => {
    const r = fitToContainer(500, 1000, 400, 400)
    expect(r.scale).toBeCloseTo(0.4)
    expect(r.tx).toBeCloseTo(100)
    expect(r.ty).toBeCloseTo(0)
  })
})
