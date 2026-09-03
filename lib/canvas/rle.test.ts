import { describe, it, expect } from 'vitest'
import { encodeRLE, decodeRLE } from './rle'

describe('encodeRLE', () => {
  it('encodes leading zeros then a run of ones', () => {
    expect(encodeRLE(new Uint8Array([0, 0, 0, 1, 1, 0, 0, 0, 0]))).toEqual([3, 2, 4])
  })

  it('emits a leading zero-length run when the mask starts filled', () => {
    expect(encodeRLE(new Uint8Array([1, 1, 0]))).toEqual([0, 2, 1])
  })

  it('encodes an all-empty mask', () => {
    expect(encodeRLE(new Uint8Array([0, 0, 0]))).toEqual([3])
  })

  it('treats any nonzero value as filled', () => {
    expect(encodeRLE(new Uint8Array([0, 255, 255, 0]))).toEqual([1, 2, 1])
  })

  it('encodes an empty mask as an empty run list', () => {
    expect(encodeRLE(new Uint8Array([]))).toEqual([])
  })
})

describe('decodeRLE', () => {
  it('round-trips an arbitrary mask', () => {
    const mask = new Uint8Array([0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1])
    expect(Array.from(decodeRLE(encodeRLE(mask), mask.length))).toEqual(Array.from(mask))
  })

  it('round-trips a mask that starts filled', () => {
    const mask = new Uint8Array([1, 1, 0, 0, 1])
    expect(Array.from(decodeRLE(encodeRLE(mask), mask.length))).toEqual(Array.from(mask))
  })

  it('pads with zeros when runs are shorter than the requested length', () => {
    expect(Array.from(decodeRLE([1, 1], 5))).toEqual([0, 1, 0, 0, 0])
  })

  it('truncates when runs overrun the requested length', () => {
    expect(Array.from(decodeRLE([0, 100], 3))).toEqual([1, 1, 1])
  })
})
